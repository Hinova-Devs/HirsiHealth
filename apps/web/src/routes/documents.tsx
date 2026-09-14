import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Download,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  Search,
  Share2,
  Trash2,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { DocumentReference } from '@medplum/fhirtypes';
import {
  CATEGORIES,
  categoryOf,
  docDate,
  docKind,
  docPlace,
  docTitle,
  deleteDocument,
  fetchDocumentBlob,
  matchesQuery,
  sortByNewest,
} from '../lib/documents';
import { documentTypeLabel, fetchInsights, type DocInsight } from '../lib/ai';

function DocumentsPage() {
  const medplum = useMedplum();
  const currentProfile = useMedplumProfile();
  const navigate = useNavigate();
  // The open document lives in the URL, so browser-back closes the viewer.
  const { doc: activeId } = documentsRoute.useSearch();

  const [documents, setDocuments] = useState<DocumentReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [insights, setInsights] = useState<Map<string, DocInsight>>(new Map());

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        if (currentProfile) {
          const bundle = await medplum.search(
            'DocumentReference',
            `subject=${currentProfile.resourceType}/${currentProfile.id}`
          );
          setDocuments(
            (bundle?.entry ?? [])
              .map((e) => e.resource as DocumentReference)
              .filter((r): r is DocumentReference => !!r)
          );
          // Kept out of the document load: if the patient's AccessPolicy does
          // not grant Task read, the library must still render without them.
          try {
            setInsights(
              await fetchInsights(medplum, `${currentProfile.resourceType}/${currentProfile.id}`)
            );
          } catch (err) {
            console.error('Could not read AI extraction Tasks:', err);
          }
        }
      } catch (err) {
        console.error('Error loading documents:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDocuments();
  }, [medplum, currentProfile]);

  const counts = useMemo(() => {
    const byCode = new Map<string, number>([['all', documents.length]]);
    for (const doc of documents) {
      const { code } = categoryOf(doc);
      byCode.set(code, (byCode.get(code) ?? 0) + 1);
    }
    return byCode;
  }, [documents]);

  const filtered = useMemo(
    () =>
      sortByNewest(
        documents.filter(
          (doc) =>
            (category === 'all' || categoryOf(doc).code === category) && matchesQuery(doc, query)
        )
      ),
    [documents, category, query]
  );

  const openDoc = (doc: DocumentReference) =>
    navigate({ to: '/documents', search: { doc: doc.id } });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-teal-400 font-display animate-pulse">Loading medical records...</p>
      </div>
    );
  }

  const activeDoc = documents.find((d) => d.id === activeId);
  if (activeDoc) {
    return (
      <DocumentView
        doc={activeDoc}
        insight={insights.get(activeDoc.id!)}
        onBack={() => navigate({ to: '/documents', search: {} })}
        onDeleted={(id) => {
          // Server transaction already succeeded; drop it from the list and
          // leave the viewer, which has nothing left to show.
          setDocuments((docs) => docs.filter((d) => d.id !== id));
          navigate({ to: '/documents', search: {} });
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Title + search + view toggle */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold font-display tracking-tight text-slate-100">
            My documents
          </h2>
          <p className="text-slate-400 text-sm mt-1.5">
            {documents.length === 0
              ? 'Nothing stored yet'
              : `${documents.length} record${documents.length === 1 ? '' : 's'} in your health wallet`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, clinic or date"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl py-3 pl-11 pr-4 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-600"
            />
          </div>
          <button
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            id="btn_toggle_view"
            title={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-teal-400 text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            {view === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            <span className="hidden sm:inline">{view === 'grid' ? 'List' : 'Grid'}</span>
          </button>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.code}
            onClick={() => setCategory(cat.code)}
            id={`tab_cat_${cat.code.replace('-', '_')}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all cursor-pointer ${
              category === cat.code
                ? 'bg-teal-500 text-slate-950 border-teal-500'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            {cat.label}
            <span className="font-mono font-normal opacity-70">{counts.get(cat.code) ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          hasDocuments={documents.length > 0}
          onClear={() => {
            setQuery('');
            setCategory('all');
          }}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onOpen={() => openDoc(doc)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((doc) => {
            const cat = categoryOf(doc);
            return (
              <button
                key={doc.id}
                onClick={() => openDoc(doc)}
                id={`row_doc_${doc.id}`}
                className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 text-left w-full p-3.5 rounded-2xl glass-panel border border-slate-800 hover:border-teal-500/50 transition-all cursor-pointer"
              >
                <span
                  className={`w-11 h-11 rounded-xl border grid place-items-center text-[10px] font-mono font-bold ${cat.chip}`}
                >
                  {cat.short}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-200 truncate group-hover:text-slate-100 transition-colors">
                    {docTitle(doc)}
                  </span>
                  <span className="block mt-0.5 text-xs text-slate-500 truncate">
                    {cat.label} · {docPlace(doc)}
                  </span>
                </span>
                <span className="text-[11px] font-mono text-slate-600 text-right leading-relaxed">
                  {docDate(doc)}
                  <br />
                  {docKind(doc)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Grid card — also used for the dashboard's recent uploads. */
export function DocumentCard({ doc, onOpen }: { doc: DocumentReference; onOpen: () => void }) {
  const cat = categoryOf(doc);
  return (
    <button
      onClick={onOpen}
      id={`card_doc_${doc.id}`}
      className="group text-left glass-panel rounded-2xl border border-slate-800 hover:border-teal-500/50 transition-all duration-300 overflow-hidden flex flex-col cursor-pointer"
    >
      <span
        className="block h-24"
        style={{
          background: `repeating-linear-gradient(135deg, ${cat.stripe} 0 9px, rgba(2,6,23,0.55) 9px 18px)`,
        }}
      />
      <span className="block p-5">
        <span
          className={`inline-block px-2 py-1 rounded-md border text-[10px] font-mono tracking-widest uppercase ${cat.chip}`}
        >
          {cat.label}
        </span>
        <span className="block mt-3 font-display font-bold text-slate-200 group-hover:text-slate-100 transition-colors line-clamp-1">
          {docTitle(doc)}
        </span>
        <span className="block mt-1 text-xs text-slate-500 line-clamp-1">{docPlace(doc)}</span>
        <span className="block mt-2.5 text-[11px] font-mono text-slate-600">
          {docDate(doc)} · {docKind(doc)}
        </span>
      </span>
    </button>
  );
}

function EmptyState({ hasDocuments, onClear }: { hasDocuments: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 gap-3">
      {hasDocuments ? (
        <>
          <AlertCircle className="w-10 h-10 text-slate-700" />
          <p className="font-display font-bold text-slate-300 text-sm">Nothing matches that search</p>
          <p className="text-slate-500 text-xs max-w-sm">
            Try a clinic name, a test name, or clear the filters.
          </p>
          <button
            onClick={onClear}
            id="btn_clear_filters"
            className="mt-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            Clear filters
          </button>
        </>
      ) : (
        <>
          <UploadCloud className="w-12 h-12 text-slate-600" />
          <p className="font-display font-bold text-slate-300 text-sm">Your document library is empty</p>
          <p className="text-slate-500 text-xs max-w-sm">
            Upload your medical documents, lab results, or prescriptions to view them here and share
            securely.
          </p>
          <Link
            to="/upload"
            id="btn_documents_upload_first"
            className="mt-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Upload Your First Document
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * Record screen: the AI's extracted data is the page. The original scan sits
 * behind a button — per the design, the reading is what the patient came for.
 */
function DocumentView({
  doc,
  insight,
  onBack,
  onDeleted,
}: {
  doc: DocumentReference;
  insight?: DocInsight;
  onBack: () => void;
  onDeleted: (id: string) => void;
}) {
  const cat = categoryOf(doc);
  const [showOriginal, setShowOriginal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          id="btn_back_to_documents"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          My documents
        </button>
        <div className="flex items-center gap-2.5">
        <Link
          to="/share"
          id="btn_doc_share"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-teal-500/40 text-teal-400 hover:bg-teal-500/10 text-xs font-bold transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </Link>
          <button
            onClick={() => setConfirmDelete(true)}
            id="btn_doc_delete"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {confirmDelete && (
        <DeleteDialog doc={doc} onCancel={() => setConfirmDelete(false)} onDeleted={onDeleted} />
      )}

      {/* Title */}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block px-2 py-1 rounded-md border text-[10px] font-mono tracking-widest uppercase ${cat.chip}`}
          >
            {insight?.documentType ? documentTypeLabel(insight.documentType) : cat.label}
          </span>
          <span className="text-xs text-slate-500">{docDate(doc)}</span>
        </div>
        <h2 className="mt-3 text-2xl md:text-3xl font-extrabold font-display tracking-tight text-slate-100">
          {docTitle(doc)}
        </h2>
        <p className="text-slate-400 text-sm mt-1.5">{docPlace(doc)}</p>
      </div>

      {/* Extracted data — the point of the screen */}
      <ExtractedFields insight={insight} />

      {/* Provenance */}
      <div className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-slate-800">
        <span className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 grid place-items-center text-[10px] font-mono font-bold text-teal-400 shrink-0">
          AI
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-slate-300 truncate">
            Read from {docTitle(doc)} · {docKind(doc)}
          </span>
          <span className="block text-[11px] text-slate-500">
            {insight?.confidence
              ? `${insight.confidence} confidence · original kept encrypted`
              : 'Not processed yet · original kept encrypted'}
          </span>
        </span>
      </div>

      {/* Original, on request */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          id="btn_toggle_original"
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-sm font-bold transition-all cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          {showOriginal ? 'Hide original document' : 'View original document'}
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showOriginal ? 'rotate-180' : ''}`}
          />
        </button>
        {showOriginal && <OriginalDocument doc={doc} />}
      </div>
    </div>
  );
}

function ExtractedFields({ insight }: { insight?: DocInsight }) {
  if (!insight) {
    return (
      <div className="glass-panel rounded-3xl border border-slate-800/80 p-6 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-600 shrink-0" />
        <p className="text-sm text-slate-500">
          The AI has not read this document yet. Its data will appear here once the pipeline
          processes it.
        </p>
      </div>
    );
  }

  if (insight.status === 'unreadable' || insight.status === 'failed') {
    return (
      <div className="glass-panel rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-3">
        <TriangleAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-slate-200">
            {insight.status === 'unreadable' ? 'Could not read this document' : 'Extraction failed'}
          </p>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{insight.reason}</p>
          {insight.technicalDetail && (
            <p className="text-[11px] font-mono text-slate-600 mt-3 break-all leading-relaxed">
              {insight.technicalDetail}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (insight.fields.length === 0) {
    return (
      <div className="glass-panel rounded-3xl border border-slate-800/80 p-6">
        <p className="text-sm text-slate-500">
          The AI returned no readable data from this document.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl border border-slate-800/80 px-6 py-1">
      {insight.fields.map((field, i) => (
        <div
          key={`${field.k}-${i}`}
          className="grid grid-cols-[minmax(88px,116px)_minmax(0,1fr)] gap-4 items-baseline py-3.5 border-b border-slate-800/60 last:border-0"
        >
          <span className="text-xs text-slate-500">{field.k}</span>
          <span className="min-w-0">
            <span
              className={`block text-sm font-semibold ${
                field.flag ? 'text-amber-400' : 'text-slate-200'
              }`}
            >
              {field.v}
            </span>
            {field.note && (
              <span className="block text-[11px] text-slate-500 mt-0.5">{field.note}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Delete confirmation.
 *
 * COPY UNDER REVIEW: deliberately does not promise permanence. Medplum's
 * delete is a soft delete and what it leaves behind server-side has not been
 * settled for this project, so this says only what is certainly true — the
 * document leaves the wallet and the app cannot bring it back. Revisit once
 * that decision is made.
 */
function DeleteDialog({
  doc,
  onCancel,
  onDeleted,
}: {
  doc: DocumentReference;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const medplum = useMedplum();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(medplum, doc);
      onDeleted(doc.id!);
    } catch (err) {
      // Transaction is atomic — nothing was removed server-side, so local
      // state stays exactly as it was.
      console.error('Delete failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel border border-slate-800 rounded-3xl p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 grid place-items-center text-rose-400 shrink-0">
            <TriangleAlert className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-slate-100">Delete this document?</h3>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              It will be removed from your wallet and this can't be undone from the app.
            </p>
            <p className="text-xs text-slate-500 mt-2 truncate">{docTitle(doc)}</p>
          </div>
        </div>

        {error && (
          <div className="flex gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={deleting}
            id="btn_cancel_delete"
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            Keep it
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            id="btn_confirm_delete"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition-all cursor-pointer"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Loads and renders the original file — only mounted when the patient asks. */
function OriginalDocument({ doc }: { doc: DocumentReference }) {
  const medplum = useMedplum();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const isImage = !!doc.content?.[0]?.attachment?.contentType?.startsWith('image/');

  useEffect(() => {
    let objectUrl: string | undefined;
    setPreviewUrl(null);
    setError(false);

    fetchDocumentBlob(medplum, doc)
      .then((blob) => {
        objectUrl = window.URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((err) => {
        console.error('Preview failed:', err);
        setError(true);
      });

    return () => {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [medplum, doc]);

  // The blob is already in memory — download it without a second round trip.
  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = docTitle(doc);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="glass-panel rounded-3xl border border-slate-800/80 p-4">
      <div className="h-[430px] rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden grid place-items-center">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <AlertCircle className="w-10 h-10 text-rose-400/60" />
            <p className="text-slate-400 text-sm font-semibold">Failed to load this document</p>
          </div>
        ) : !previewUrl ? (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            <span className="text-xs font-semibold">Loading original...</span>
          </div>
        ) : isImage ? (
          <img
            src={previewUrl}
            alt={docTitle(doc)}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <iframe src={previewUrl} title={docTitle(doc)} className="w-full h-full bg-white" />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-2 pt-3">
        <span className="text-[11px] text-slate-500">
          Decrypted in your browser · not sent anywhere
        </span>
        <div className="flex items-center gap-3">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-slate-500 hover:text-teal-400 transition-colors"
            >
              Open in new tab
            </a>
          )}
          <button
            onClick={handleDownload}
            disabled={!previewUrl}
            id="btn_doc_download"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-40 text-slate-300 text-[11px] font-bold transition-all cursor-pointer"
          >
            <Download className="w-3 h-3" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents',
  // Optional, so plain <Link to="/documents"> stays valid.
  validateSearch: (search: Record<string, unknown>): { doc?: string } =>
    typeof search.doc === 'string' ? { doc: search.doc } : {},
  component: DocumentsPage,
});

export { documentsRoute };
