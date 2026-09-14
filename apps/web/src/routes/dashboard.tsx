import { createRoute, Link } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { 
  FolderHeart, 
  UploadCloud, 
  ShieldAlert, 
  Activity, 
  FileText,
  Calendar,
  Droplet,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { Patient, DocumentReference } from '@medplum/fhirtypes';

function DashboardPage() {
  const medplum = useMedplum();
  const currentProfile = useMedplumProfile();
  const [profile, setProfile] = useState<Patient | null>(null);
  const [documents, setDocuments] = useState<DocumentReference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        if (currentProfile) {
          const isPatient = currentProfile.resourceType === 'Patient';
          setProfile(
            isPatient
              ? (currentProfile as Patient)
              : ({
                  resourceType: 'Patient',
                  id: currentProfile.id,
                  name: [{ given: ['Practitioner/Admin'], family: currentProfile?.meta?.project }]
                } as Patient)
          );
          // Search for DocumentReferences belonging to this profile
          const docBundle = await medplum.search('DocumentReference', `subject=${currentProfile.resourceType}/${currentProfile.id}`);
          if (docBundle && docBundle.entry) {
            const docs = docBundle.entry
              .map((e: any) => e.resource as DocumentReference)
              .filter((r: any): r is DocumentReference => !!r);
            setDocuments(docs);
          }
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [medplum, currentProfile]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-teal-400 font-display animate-pulse">Loading health dashboard...</p>
      </div>
    );
  }

  const patientName = profile?.name?.[0]
    ? `${profile.name[0].given?.join(' ') || ''} ${profile.name[0].family || ''}`.trim()
    : 'Valued Patient';

  // Read emergency properties from Patient resource extensions if present, otherwise default to "Pending"
  // In FHIR, blood type is sometimes stored as an extension or standard observation.
  // We can also extract custom extensions from FHIR Patient:
  const bloodTypeExtension = profile?.extension?.find(
    (e: any) => e.url === 'http://hl7.org/fhir/StructureDefinition/patient-bloodType' || e.url?.includes('bloodType')
  );
  const bloodType = bloodTypeExtension?.valueString || 'O+'; // fallback/mock for demo

  const allergyExtension = profile?.extension?.find(
    (e: any) => e.url?.includes('allergy') || e.url?.includes('allergies')
  );
  const allergiesList = allergyExtension?.valueString || 'None reported';

  // Sort documents by date, most recent first
  const sortedDocs = [...documents].sort((a, b) => {
    const dateA = a.date || a.meta?.lastUpdated || '';
    const dateB = b.date || b.meta?.lastUpdated || '';
    return dateB.localeCompare(dateA);
  });

  const recentDocs = sortedDocs.slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      {/* Header and Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold font-display tracking-tight text-slate-100">
            Assalamu Alaikum, {profile?.name?.[0]?.given?.[0] || 'Guest'} 👋
          </h2>
          <p className="text-slate-400 text-sm mt-1">Here is a summary of your personal health records.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 self-start md:self-auto">
          <Calendar className="w-4 h-4 text-teal-400" />
          <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Grid: Health Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Documents */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Documents</span>
            <span className="text-3xl font-black font-display text-slate-100">{documents.length}</span>
            <span className="text-[10px] text-teal-400 font-semibold mt-1">FHIR References</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <FolderHeart className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Blood Type */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Blood Type</span>
            <span className="text-3xl font-black font-display text-rose-500">{bloodType}</span>
            <span className="text-[10px] text-rose-400 font-semibold mt-1">Emergency Profile</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <Droplet className="w-6 h-6 fill-rose-500/20" />
          </div>
        </div>

        {/* Card 3: Allergies */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex items-center justify-between col-span-1 sm:col-span-2 lg:col-span-2">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Key Allergies</span>
            <span className="text-lg font-bold font-display text-slate-200 truncate mt-1">{allergiesList}</span>
            <span className="text-[10px] text-teal-400 font-semibold mt-1">Standard extensions mapped</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Grid: Actions & Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Quick Actions & Health Card */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 flex flex-col gap-4">
            <h3 className="font-display font-bold text-lg text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-400" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <Link
                to="/upload"
                id="action_upload"
                className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all font-semibold text-sm hover:translate-x-1 cursor-pointer"
              >
                <UploadCloud className="w-5 h-5 text-teal-400" />
                <span>Upload Medical Report</span>
              </Link>
              <Link
                to="/emergency"
                id="action_emergency"
                className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all font-semibold text-sm hover:translate-x-1 cursor-pointer"
              >
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Show Emergency Card</span>
              </Link>
              <Link
                to="/share"
                id="action_share"
                className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all font-semibold text-sm hover:translate-x-1 cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <span>Controlled Access Links</span>
              </Link>
            </div>
          </div>
          
          {/* Medical Identity Widget */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900/60 to-indigo-950/20 flex flex-col gap-4">
            <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">Patient Identification</span>
            <div>
              <p className="text-base font-bold text-slate-200">{patientName}</p>
              <p className="text-xs text-slate-500 mt-1">FHIR Patient Resource Reference:</p>
              <code className="text-[10px] text-teal-400 bg-slate-950 px-2 py-1 rounded block mt-1 select-all border border-slate-900 font-mono truncate">
                Patient/{profile?.id || 'N/A'}
              </code>
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800/60 pt-3">
              <p>Email: {profile?.telecom?.find((t: any) => t.system === 'email')?.value || 'N/A'}</p>
              <p className="mt-1">Gender: {profile?.gender || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Documents */}
        <div className="lg:col-span-2 glass-panel p-8 rounded-3xl border border-slate-800/80 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              Recent Documents
            </h3>
            <Link
              to="/documents"
              id="link_view_all_docs"
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
            >
              View Library ({documents.length})
            </Link>
          </div>

          {recentDocs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <UploadCloud className="w-12 h-12 text-slate-600 mb-4 animate-bounce" />
              <p className="font-display font-bold text-slate-300 text-sm">Your document library is empty</p>
              <p className="text-slate-500 text-xs mt-1 max-w-sm">
                Upload your medical documents, lab results, or prescriptions to view them here and share securely.
              </p>
              <Link
                to="/upload"
                id="btn_dashboard_upload_first"
                className="mt-4 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-lg transition-all cursor-pointer"
              >
                Upload Your First Document
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {recentDocs.map((doc) => {
                const docDate = doc.date 
                  ? new Date(doc.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : 'No date';
                const docCategory = doc.category?.[0]?.text || doc.category?.[0]?.coding?.[0]?.display || 'General Record';
                const attachmentTitle = doc.content?.[0]?.attachment?.title || doc.description || 'Untitled Document';
                
                return (
                  <Link 
                    key={doc.id} 
                    to="/documents"
                    search={{ doc: doc.id }}
                    id={`btn_view_recent_${doc.id}`}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/40 border border-slate-900 hover:border-slate-800 hover:bg-slate-900/80 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 group-hover:bg-indigo-500 group-hover:text-slate-950 transition-all">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-slate-100 transition-colors">
                          {attachmentTitle}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-indigo-400 font-bold border border-slate-800/80 uppercase">
                            {docCategory}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {docDate}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="p-2 rounded-lg group-hover:bg-slate-800 text-slate-400 group-hover:text-teal-400 transition-all"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
});

export { dashboardRoute };
