import { createRoute, useNavigate } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { useMedplum } from '@medplum/react';
import { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle, 
  X, 
  Calendar,
  AlertCircle,
  FileBadge
} from 'lucide-react';
import { DocumentReference } from '@medplum/fhirtypes';

// Category mappings from README
const CATEGORIES = [
  { label: 'Lab Result', code: '11502-2' },
  { label: 'Prescription', code: '57833-6' },
  { label: 'Imaging Report', code: '18748-4' },
  { label: 'Diagnosis / Note', code: '11488-4' },
  { label: 'Vaccination', code: '11369-6' },
  { label: 'General', code: '34117-2' },
];

function UploadPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [categoryCode, setCategoryCode] = useState('11502-2'); // default to lab
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Status states
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      // Auto-populate title if empty
      if (!title) {
        // Strip extension
        const cleanName = droppedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(cleanName.replace(/[_-]/g, ' '));
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!title) {
        const cleanName = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(cleanName.replace(/[_-]/g, ' '));
      }
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Please select or drag a medical document to upload.');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a descriptive title for this document.');
      return;
    }

    setLoading(true);

    try {
      // 1. Get active profile (supports Patient or Practitioner/Admin accounts)
      const userProfile = await medplum.getProfileAsync();
      console.log('PROFILE:', JSON.stringify(userProfile));
      if (!userProfile) {
        throw new Error('Authenticated profile could not be determined.');
      }

      // 2. Upload file via createMedia to set Binary.securityContext automatically
      const media = await medplum.createMedia({
        data: file,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        additionalFields: {
          subject: {
            reference: `${userProfile.resourceType}/${userProfile.id}`
          }
        }
      });

      if (!media || !media.content?.url) {
        throw new Error('Failed to retrieve reference ID from media storage response.');
      }

      // 3. Resolve category label
      const selectedCat = CATEGORIES.find((c: any) => c.code === categoryCode) || CATEGORIES[0];

      // 4. Create DocumentReference Resource
      const docRef: DocumentReference = {
        resourceType: 'DocumentReference',
        status: 'current',
        subject: {
          reference: `${userProfile.resourceType}/${userProfile.id}`
        },
        date: new Date(docDate).toISOString(),
        category: [
          {
            coding: [
              {
                system: 'http://loinc.org',
                code: categoryCode,
                display: selectedCat.label
              }
            ],
            text: selectedCat.label
          }
        ],
        content: [
          {
            attachment: {
              contentType: file.type || 'application/octet-stream',
              url: media.content.url,
              title: title.trim(),
              size: file.size
            }
          }
        ],
        description: notes.trim() || undefined
      };

      await medplum.createResource(docRef);
      setSuccess(true);
      
      // Redirect after brief delay
      setTimeout(() => {
        navigate({ to: '/documents' });
      }, 1500);

    } catch (err: any) {
      console.error('Upload transaction failed:', err);
      setError(err.message || 'An error occurred while uploading file resources. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      {/* Title Header */}
      <div>
        <h2 className="text-3xl font-extrabold font-display tracking-tight text-slate-100">Upload Health Document</h2>
        <p className="text-slate-400 text-sm mt-1">Add reports, prescriptions, or laboratory results to your secure wallet.</p>
      </div>

      {success ? (
        <div className="glass-panel p-8 rounded-3xl border border-teal-500/20 bg-teal-950/10 text-center flex flex-col items-center gap-4 py-16 animate-in zoom-in-95 duration-200">
          <CheckCircle className="w-16 h-16 text-teal-400 animate-bounce" />
          <div>
            <h3 className="font-display font-bold text-xl text-slate-100">Upload Complete</h3>
            <p className="text-teal-400/80 text-xs mt-1">FHIR Binary & DocumentReference resources successfully committed.</p>
          </div>
          <p className="text-slate-400 text-xs mt-2">Redirecting you back to your library...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <div className="flex gap-2.5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-4.5 h-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Drag & Drop File Zone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Select File</label>
            
            {file ? (
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-3xl py-12 px-6 text-center cursor-pointer transition-all duration-300 ${
                  dragActive
                    ? 'border-teal-500 bg-teal-500/5 scale-[0.99]'
                    : 'border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <UploadCloud className={`w-12 h-12 mb-4 transition-colors duration-300 ${
                  dragActive ? 'text-teal-400' : 'text-slate-600'
                }`} />
                <p className="font-display font-bold text-slate-300 text-sm">Drag & drop your file here</p>
                <p className="text-slate-500 text-xs mt-1">Supports PDF, PNG, JPG (Max 50MB)</p>
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Browse Files
                </button>
              </div>
            )}
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400" htmlFor="title-input">
                Document Name / Title
              </label>
              <input
                id="title-input"
                type="text"
                placeholder="e.g. CBC Blood Test Report"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 px-4 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600"
              />
            </div>

            {/* Category Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400" htmlFor="category-select">
                Record Type / Category
              </label>
              <select
                id="category-select"
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 px-4 text-sm font-medium text-slate-200 outline-none transition-all cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.code} value={cat.code} className="bg-slate-950 text-slate-200">
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400" htmlFor="date-input">
                Record Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  id="date-input"
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-slate-200 outline-none transition-all cursor-pointer"
                />
              </div>
            </div>

            {/* Helper display code */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">FHIR LOINC Code Mapping</label>
              <div className="flex items-center gap-2 p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 text-xs text-slate-500">
                <FileBadge className="w-4 h-4 text-teal-400" />
                <span>
                  LOINC code: <span className="font-mono text-teal-400">{categoryCode}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Notes Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400" htmlFor="notes-input">
              Description / Notes
            </label>
            <textarea
              id="notes-input"
              rows={4}
              placeholder="Add details about findings, prescribing doctor, or any relevant details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 px-4 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="btn_submit_upload"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-sm transition-all active:scale-95 shadow-md shadow-teal-500/10 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                <span>Uploading FHIR Resources...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4.5 h-4.5" />
                <span>Upload & Index Document</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: UploadPage,
});

export { uploadRoute };
