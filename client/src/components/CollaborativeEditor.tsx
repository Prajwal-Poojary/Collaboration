import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css'; // Add css for snow theme
import 'quill/dist/quill.snow.css'; // Add css for snow theme
import './CollaborativeEditor.css'; // Custom cursor styles
import { saveAs } from 'file-saver';
import { RotateCcw, RotateCw } from 'lucide-react';

// Register cursors module

// Register cursors module
Quill.register('modules/cursors', QuillCursors);

interface CollaborativeEditorProps {
    socket: any;
    meetingId: string;
    user: { _id: string; name: string };
}

const CollaborativeEditor = ({ socket, meetingId, user }: CollaborativeEditorProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<Quill | null>(null);
    const cursorsRef = useRef<any>(null); // QuillCursors instance
    const [isLoaded, setIsLoaded] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [lastSaved, setLastSaved] = useState<Date>(new Date());
    const [wordCount, setWordCount] = useState(0);

    // Helper to generate color from string
    const stringToColor = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    };

    // Save debounce timer
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initialize Quill (Once)
    useEffect(() => {
        if (!containerRef.current || quillRef.current) return;

        console.log("Initializing Quill...");
        // Initialize Quill
        const quill = new Quill(containerRef.current, {
            theme: 'snow',
            modules: {
                cursors: {
                    transformOnTextChange: true,
                    hideDelayMs: 5000,
                    hideSpeedMs: 400,
                },
                toolbar: [
                    [{ header: [1, 2, 3, 4, 5, 6, false] }],
                    [{ font: [] }, { size: [] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ color: [] }, { background: [] }],
                    [{ script: 'sub' }, { script: 'super' }],
                    [{ header: 1 }, { header: 2 }, 'blockquote', 'code-block'],
                    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
                    [{ direction: 'rtl' }, { align: [] }],
                    ['link', 'image', 'video', 'formula'],
                    ['clean']
                ],
                history: {
                    delay: 1000,
                    maxStack: 100,
                    userOnly: true
                }
            },
            placeholder: 'Start collaborating...'
        });

        quillRef.current = quill;
        cursorsRef.current = quill.getModule('cursors');
        console.log("Quill Initialized. Cursors module:", cursorsRef.current ? "Loaded" : "Failed");

        // Set initial load state
        setIsLoaded(true);

    }, []); // Run once on mount

    // Socket Listeners (Re-run if socket changes)
    useEffect(() => {
        const quill = quillRef.current;
        if (!socket || !quill) return;

        console.log("Attaching Socket Listeners...");

        // Initial Load Request
        socket.emit('get-document', { meetingId });

        const handleDocLoad = ({ content }: { content: any }) => {
            console.log("Document Loaded", content);
            if (content) {
                quill.setContents(content);
            }
        };

        const handleReceiveChanges = (delta: any) => {
            // console.log("Received Changes", delta);
            quill.updateContents(delta);
        };

        const handleCursorUpdate = ({ userId, userName, range, color }: any) => {
            if (cursorsRef.current) {
                if (range) {
                    cursorsRef.current.createCursor(userId, userName, color);
                    cursorsRef.current.moveCursor(userId, range);
                } else {
                    cursorsRef.current.removeCursor(userId);
                }
            }
        };

        const handleRequestState = ({ requesterId }: { requesterId: string }) => {
            const currentContent = quill.getContents();
            socket.emit('doc-sync-state', { content: currentContent, requesterId });
        };

        socket.on('doc-load', handleDocLoad);
        socket.on('receive-changes', handleReceiveChanges);
        socket.on('cursor-update', handleCursorUpdate);
        socket.on('doc-request-state', handleRequestState);

        // Quill Text Change Handler
        const handleTextChange = (delta: any, _oldDelta: any, source: string) => {
            // Update Word Count
            const text = quill.getText();
            setWordCount(text.trim().length > 0 ? text.trim().split(/\s+/).length : 0);

            if (source !== 'user') return;
            setSaveStatus('unsaved');
            socket.emit('send-changes', { meetingId, delta });

            // Debounce Save
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            setSaveStatus('saving');
            saveTimeoutRef.current = setTimeout(() => {
                const content = quill.getContents();
                socket.emit('save-document', { meetingId, content });
                setSaveStatus('saved');
                setLastSaved(new Date());
            }, 2000);
        };

        const handleSelectionChange = (range: any, _oldRange: any, _source: string) => {
            // Always emit cursor change if range exists or removed
            socket.emit('cursor-change', {
                meetingId,
                range,
                userName: user.name,
                color: stringToColor(user.name + user._id)
            });
        };

        quill.on('text-change', handleTextChange);
        quill.on('selection-change', handleSelectionChange);

        return () => {
            console.log("Detaching Socket Listeners...");
            socket.off('doc-load', handleDocLoad);
            socket.off('receive-changes', handleReceiveChanges);
            socket.off('cursor-update', handleCursorUpdate);
            socket.off('doc-request-state', handleRequestState);

            quill.off('text-change', handleTextChange);
            quill.off('selection-change', handleSelectionChange);
        };
    }, [socket, meetingId, user]); // Re-attach if socket changes

    const handleSaveAndDownload = () => {
        if (!quillRef.current || !socket) return;
        setSaveStatus('saving');
        const content = quillRef.current.getContents();
        socket.emit('save-document', { meetingId, content });

        // Export to Word (HTML Blob)
        const htmlContent = quillRef.current.root.innerHTML;
        const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
        const postHtml = "</body></html>";
        const html = preHtml + htmlContent + postHtml;

        const blob = new Blob(['\ufeff', html], {
            type: 'application/msword'
        });
        saveAs(blob, `document_${new Date().toISOString().slice(0, 10)}.doc`);

        setTimeout(() => {
            setSaveStatus('saved');
            setLastSaved(new Date());
            alert("Document saved and downloaded!");
        }, 800);
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 rounded-lg shadow-lg overflow-hidden relative">

            {/* Header / Toolbar Area */}
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                    {/* Save Status & Button */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSaveAndDownload}
                            disabled={saveStatus === 'saving'}
                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${saveStatus === 'unsaved' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                            {saveStatus === 'saving' ? 'Saving...' : 'Save & Download'}
                        </button>
                        <span className="text-xs text-gray-400">
                            {saveStatus === 'saved' ? `Saved at ${lastSaved.toLocaleTimeString()}` : ''}
                            {saveStatus === 'unsaved' ? 'Unsaved changes' : ''}
                        </span>
                    </div>
                </div>

                {/* Undo / Redo Controls */}
                <div className="flex items-center gap-1">
                    <button onClick={() => quillRef.current?.history.undo()} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Undo">
                        <RotateCcw size={16} />
                    </button>
                    <button onClick={() => quillRef.current?.history.redo()} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Redo">
                        <RotateCw size={16} />
                    </button>
                </div>
            </div>

            {!isLoaded && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
                    <span className="text-gray-500 font-medium">Loading document...</span>
                </div>
            )}

            {/* Editor Container - mimicking a "page" */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-gray-100 cursor-text" onClick={() => quillRef.current?.focus()}>
                <div className="w-full max-w-[816px] bg-white min-h-[1056px] shadow-sm ring-1 ring-gray-900/5 transition-shadow relative">
                    <div ref={containerRef} className="h-full" />
                </div>
            </div>

            {/* Word Count Footer */}
            <div className="bg-white border-t border-gray-200 px-4 py-1 text-xs text-gray-500 flex justify-end">
                <span>{wordCount} words</span>
            </div>

        </div>
    );
};

export default CollaborativeEditor;
