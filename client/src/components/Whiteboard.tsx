import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
    Eraser, Pen, Trash2, X, Highlighter, Type,
    Minus, ArrowRight, Square, Circle as CircleIcon,
    Undo, Redo, ZoomIn, ZoomOut, Download, Move
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface WhiteboardProps {
    socket: any;
    meetingId: string;
    onClose: () => void;
}

type ToolType = 'pen' | 'eraser' | 'highlighter' | 'text' | 'line' | 'arrow' | 'rect' | 'circle' | 'move';

interface WhiteboardElement {
    id: string;
    type: ToolType;
    x: number;
    y: number;
    width?: number; // For shapes/text
    height?: number;
    points?: { x: number; y: number }[]; // For pen/highlighter
    x1?: number; // For line/arrow
    y1?: number;
    color: string;
    lineWidth: number;
    text?: string;
    opacity?: number;
    creatorId?: string; // To track who created it
}

interface CameraState {
    x: number;
    y: number;
    zoom: number;
}

const COLORS = [
    '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#a855f7', '#ec4899', '#9ca3af', '#000000'
];

const Whiteboard: React.FC<WhiteboardProps> = ({ socket, meetingId, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [elements, setElements] = useState<WhiteboardElement[]>([]);
    const [history, setHistory] = useState<WhiteboardElement[][]>([]);
    const [historyStep, setHistoryStep] = useState(0);

    const [tool, setTool] = useState<ToolType>('pen');
    const [color, setColor] = useState('#ffffff');
    const [lineWidth, setLineWidth] = useState(2);
    const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });

    const [isDrawing, setIsDrawing] = useState(false);
    const [textInput, setTextInput] = useState<{ x: number, y: number, clientX: number, clientY: number, id: string } | null>(null);

    // Use refs for values accessed in event listeners to avoid stale closures if not using callbacks
    const elementsRef = useRef(elements);
    const cameraRef = useRef(camera);
    const toolRef = useRef(tool);

    useEffect(() => {
        elementsRef.current = elements;
    }, [elements]);

    useEffect(() => {
        cameraRef.current = camera;
    }, [camera]);

    useEffect(() => {
        toolRef.current = tool;
    }, [tool]);

    // --- RENDERING ---
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Clear Screen
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply Camera Transform
        ctx.save();
        ctx.translate(camera.x, camera.y);
        ctx.scale(camera.zoom, camera.zoom);

        // Draw Elements
        elements.forEach(el => {
            ctx.globalAlpha = el.opacity ?? 1;
            ctx.strokeStyle = el.color;
            ctx.lineWidth = el.lineWidth;
            ctx.fillStyle = el.color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();

            if (el.type === 'pen' || el.type === 'highlighter') {
                if (el.points && el.points.length > 0) {
                    ctx.moveTo(el.points[0].x, el.points[0].y);
                    // Catmull-Rom spline or simple line to
                    for (let i = 1; i < el.points.length; i++) {
                        ctx.lineTo(el.points[i].x, el.points[i].y);
                    }
                    ctx.stroke();
                }
            } else if (el.type === 'line' || el.type === 'arrow') {
                if (el.x1 !== undefined && el.y1 !== undefined) {
                    ctx.moveTo(el.x, el.y);
                    ctx.lineTo(el.x1, el.y1);
                    ctx.stroke();

                    if (el.type === 'arrow') {
                        const angle = Math.atan2(el.y1 - el.y, el.x1 - el.x);
                        ctx.moveTo(el.x1, el.y1);
                        ctx.lineTo(el.x1 - 10 * Math.cos(angle - Math.PI / 6), el.y1 - 10 * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(el.x1, el.y1);
                        ctx.lineTo(el.x1 - 10 * Math.cos(angle + Math.PI / 6), el.y1 - 10 * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();
                    }
                }
            } else if (el.type === 'rect') {
                if (el.width !== undefined && el.height !== undefined) {
                    ctx.strokeRect(el.x, el.y, el.width, el.height);
                }
            } else if (el.type === 'circle') {
                if (el.width !== undefined && el.height !== undefined) {
                    // Ellipse
                    ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, Math.abs(el.width / 2), Math.abs(el.height / 2), 0, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            } else if (el.type === 'text') {
                ctx.font = `${el.lineWidth * 10}px sans-serif`;
                ctx.textBaseline = 'top';
                ctx.fillText(el.text || '', el.x, el.y);
            }

            ctx.closePath();
            ctx.globalAlpha = 1; // Reset opacity
        });

        ctx.restore();
    }, [elements, camera]);

    useEffect(() => {
        requestAnimationFrame(renderCanvas);
    }, [renderCanvas]);

    // --- SOCKET SYNC ---
    useEffect(() => {
        if (!socket) return;

        socket.on('wb-update-elements', (serverElements: WhiteboardElement[]) => {
            console.log("Received full board update:", serverElements.length);
            setElements(serverElements);
            // We should also update history stack if we want robust undo/redo for collaboration
            // stick to simple history for local actions for now or just reset history on external update
            setHistory(prev => [...prev, serverElements]);
            setHistoryStep(prev => prev + 1);
        });

        // Request initial state
        socket.emit('wb-request-state', { meetingId });

        return () => {
            socket.off('wb-update-elements');
        };
    }, [socket, meetingId]);

    const broadcastUpdate = (newElements: WhiteboardElement[]) => {
        socket.emit('wb-update', { meetingId, elements: newElements });
    };

    // --- INTERACTION ---
    const getPoint = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as MouseEvent | React.MouseEvent).clientX;
            clientY = (e as MouseEvent | React.MouseEvent).clientY;
        }

        // Convert key coordinates to World coordinates
        return {
            x: (clientX - rect.left - camera.x) / camera.zoom,
            y: (clientY - rect.top - camera.y) / camera.zoom
        };
    };

    // --- HIT TESTING ---
    const isPointNearElement = (ex: number, ey: number, element: WhiteboardElement, threshold = 10) => {
        const { type, x, y, width, height, x1, y1, points } = element;

        switch (type) {
            case 'rect':
            case 'text': // treat text as rect
                return ex >= x && ex <= x + (width || 0) && ey >= y && ey <= y + (height || 0);
            case 'circle':
                // Simple distance check from center (ellipse logic is harder, treat as rect or distance)
                if (width && height) {
                    const cx = x + width / 2;
                    const cy = y + height / 2;
                    const rx = Math.abs(width / 2);
                    const ry = Math.abs(height / 2);
                    // Check if inside ellipse
                    return ((Math.pow(ex - cx, 2) / Math.pow(rx, 2)) + (Math.pow(ey - cy, 2) / Math.pow(ry, 2))) <= 1;
                }
                return false;
            case 'line':
            case 'arrow':
                if (x1 === undefined || y1 === undefined) return false;
                // distance from point to line segment
                const A = ex - x;
                const B = ey - y;
                const C = x1 - x;
                const D = y1 - y;
                const dot = A * C + B * D;
                const len_sq = C * C + D * D;
                let param = -1;
                if (len_sq !== 0) param = dot / len_sq;
                let xx, yy;
                if (param < 0) { xx = x; yy = y; }
                else if (param > 1) { xx = x1; yy = y1; }
                else { xx = x + param * C; yy = y + param * D; }
                const dx = ex - xx;
                const dy = ey - yy;
                return (dx * dx + dy * dy) < threshold * threshold;
            case 'pen':
            case 'highlighter':
                if (!points) return false;
                // Check if near any segment
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];
                    // Same distance to line segment logic
                    const A = ex - p1.x;
                    const B = ey - p1.y;
                    const C = p2.x - p1.x;
                    const D = p2.y - p1.y;
                    const dot = A * C + B * D;
                    const len_sq = C * C + D * D;
                    let param = -1;
                    if (len_sq !== 0) param = dot / len_sq;
                    let xx, yy;
                    if (param < 0) { xx = p1.x; yy = p1.y; }
                    else if (param > 1) { xx = p2.x; yy = p2.y; }
                    else { xx = p1.x + param * C; yy = p1.y + param * D; }
                    const dx = ex - xx;
                    const dy = ey - yy;
                    if ((dx * dx + dy * dy) < threshold * threshold) return true;
                }
                return false;
            default:
                return false;
        }
    };

    const handleEraser = (ex: number, ey: number) => {
        // Find elements to remove (reverse order to hit top-most first?)
        // Actually for eraser, maybe delete all under cursor or just one? "Standard" is all or top-most.
        // Let's delete ALL touched elements for disjoint generic eraser feeling.
        const remaining = elements.filter(el => !isPointNearElement(ex, ey, el, 20 / camera.zoom));
        if (remaining.length !== elements.length) {
            setElements(remaining);
            // We should debounce broadcast? or just broadcast on mouse up
        }
    };

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        console.log("Whiteboard MouseDown. Tool:", tool);
        if (tool === 'move') {
            setIsDrawing(true);
            return;
        }

        const { x, y } = getPoint(e);
        // Get raw client coordinates for reliable input positioning
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const id = uuidv4();

        if (tool === 'eraser') {
            handleEraser(x, y);
            setIsDrawing(true); // Eraser also starts drawing
            return;
        }

        if (tool === 'text') {
            e.preventDefault(); // Stop canvas from stealing focus / default selection
            console.log("Text tool active. Current input:", textInput);

            if (!textInput) {
                console.log("Creating new text input at:", clientX, clientY);
                // Ensure we have valid coordinates
                const cx = clientX || 100;
                const cy = clientY || 100;
                setTextInput({ x, y, clientX: cx, clientY: cy, id });
            }
            return;
        }

        setIsDrawing(true);

        let newElement: WhiteboardElement | null = null;

        if (tool === 'pen' || tool === 'highlighter') {
            newElement = {
                id,
                type: tool,
                x, y,
                points: [{ x, y }],
                color: tool === 'highlighter' ? color : color,
                lineWidth: tool === 'highlighter' ? 20 : lineWidth,
                opacity: tool === 'highlighter' ? 0.3 : 1
            };
        } else if (tool === 'line' || tool === 'arrow') {
            newElement = { id, type: tool, x, y, x1: x, y1: y, color, lineWidth };
        } else if (tool === 'rect' || tool === 'circle') {
            newElement = { id, type: tool, x, y, width: 0, height: 0, color, lineWidth };
        }

        if (newElement) {
            const nextElements = [...elements, newElement];
            setElements(nextElements);
        }
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;

        if (tool === 'move') {
            const me = e as React.MouseEvent;
            if (me.movementX !== undefined) {
                setCamera(prev => ({ ...prev, x: prev.x + me.movementX, y: prev.y + me.movementY }));
            }
            return;
        }

        const { x, y } = getPoint(e);

        if (tool === 'eraser') {
            handleEraser(x, y);
            return;
        }

        const index = elements.length - 1;
        if (index < 0) return;

        const elementsCopy = [...elements];
        const el = { ...elementsCopy[index] };

        if ((el.type === 'pen' || el.type === 'highlighter') && el.points) {
            el.points = [...el.points, { x, y }];
        } else if (el.type === 'line' || el.type === 'arrow') {
            el.x1 = x;
            el.y1 = y;
        } else if (el.type === 'rect' || el.type === 'circle') {
            el.width = x - el.x;
            el.height = y - el.y;
        }

        elementsCopy[index] = el;
        setElements(elementsCopy);
    };

    const handleMouseUp = () => {
        if (isDrawing) {
            setIsDrawing(false);
            if (tool !== 'move' && tool !== 'text') {
                broadcastUpdate(elements);
                saveHistory();
            }
        }
    };

    const saveHistory = () => {
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push(elements);
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
    };

    const handleUndo = () => {
        if (historyStep > 0) {
            const prev = history[historyStep - 1];
            setElements(prev);
            setHistoryStep(historyStep - 1);
            broadcastUpdate(prev);
        }
    };

    const handleRedo = () => {
        if (historyStep < history.length - 1) {
            const next = history[historyStep + 1];
            setElements(next);
            setHistoryStep(historyStep + 1);
            broadcastUpdate(next);
        }
    };

    const handleZoom = (delta: number) => {
        setCamera(prev => ({
            ...prev,
            zoom: Math.min(Math.max(prev.zoom + delta, 0.1), 5)
        }));
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            handleZoom(e.deltaY * -0.001);
        } else {
            setCamera(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
        }
    };

    const handleTextAreaBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        if (!textInput) return;
        const text = e.target.value;
        if (text.trim()) {
            // Estimate dimensions for hit testing
            const width = text.length * 12; // Rough estimate
            const height = 24;

            const newEl: WhiteboardElement = {
                id: textInput.id,
                type: 'text',
                x: textInput.x,
                y: textInput.y,
                width,
                height,
                color,
                lineWidth: 2, // Font size logic
                text,
                opacity: 1
            };
            const next = [...elements, newEl];
            setElements(next);
            broadcastUpdate(next);
            saveHistory();
        }
        setTextInput(null);
        setIsDrawing(false);
    };

    const handleExport = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `whiteboard-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    };

    const clearBoard = () => {
        if (confirm("Are you sure you want to clear the board for everyone?")) {
            setElements([]);
            broadcastUpdate([]);
            saveHistory();
        }
    };

    // Auto-resize
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current && canvasRef.current.parentElement) {
                canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
                canvasRef.current.height = canvasRef.current.parentElement.clientHeight;
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    return (
        <div className="relative w-full h-full bg-[#1e1e1e] rounded-3xl overflow-hidden shadow-2xl flex flex-col group">
            {/* Toolbar */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 bg-zinc-800/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-lg z-20">
                <div className="flex flex-col gap-1">
                    {[
                        { t: 'move', i: <Move size={20} />, label: "Move/Pan" },
                        { t: 'pen', i: <Pen size={20} />, label: "Pen" },
                        { t: 'eraser', i: <Eraser size={20} />, label: "Eraser" }, // Vector eraser not implemented fully yet, acts as placeholder or paint white?
                        { t: 'highlighter', i: <Highlighter size={20} />, label: "Highlighter" },
                        { t: 'text', i: <Type size={20} />, label: "Text" },
                        { t: 'line', i: <Minus size={20} />, label: "Line" },
                        { t: 'arrow', i: <ArrowRight size={20} />, label: "Arrow" },
                        { t: 'rect', i: <Square size={20} />, label: "Rectangle" },
                        { t: 'circle', i: <CircleIcon size={20} />, label: "Circle" },
                    ].map(btn => (
                        <button
                            key={btn.t}
                            onClick={() => setTool(btn.t as ToolType)}
                            className={`p-2 rounded-lg transition-colors ${tool === btn.t ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                            title={btn.label}
                        >
                            {btn.i}
                        </button>
                    ))}
                </div>
            </div>

            {/* Options Bar */}
            <div className="absolute top-4 left-20 right-20 flex justify-center pointer-events-none">
                <div className="pointer-events-auto bg-zinc-800/90 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg flex items-center gap-4">
                    <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                        <button onClick={handleUndo} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg">
                            <Undo size={20} />
                        </button>
                        <button onClick={handleRedo} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg">
                            <Redo size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-1 border-r border-white/10 pr-4">
                        {COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                        <input
                            type="color"
                            value={color}
                            onChange={e => setColor(e.target.value)}
                            className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden ml-1"
                        />
                    </div>

                    <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                        <span className="text-xs text-gray-400 font-mono">Size</span>
                        <input
                            type="range"
                            min="1" max="20"
                            value={lineWidth}
                            onChange={e => setLineWidth(Number(e.target.value))}
                            className="w-24 accent-indigo-500"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => handleZoom(-0.1)}><ZoomOut size={18} className="text-gray-400" /></button>
                        <span className="text-xs text-gray-400 w-8 text-center">{Math.round(camera.zoom * 100)}%</span>
                        <button onClick={() => handleZoom(0.1)}><ZoomIn size={18} className="text-gray-400" /></button>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 bg-zinc-800/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-lg z-20">
                <button onClick={handleExport} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg" title="Export Image">
                    <Download size={20} />
                </button>
                <button onClick={clearBoard} className="p-2 text-red-400 hover:text-white hover:bg-red-500/50 rounded-lg" title="Clear Board">
                    <Trash2 size={20} />
                </button>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg" title="Close">
                    <X size={20} />
                </button>
            </div>

            {/* Text Input Overlay - Portaled to Body */}
            {textInput && ReactDOM.createPortal(
                <textarea
                    autoFocus
                    placeholder="Type here..."
                    className="fixed shadow-2xl"
                    style={{
                        left: `${textInput.clientX}px`,
                        top: `${textInput.clientY}px`,
                        fontSize: '24px',
                        color: color,
                        backgroundColor: 'transparent',
                        border: '2px dotted white',
                        borderRadius: '4px',
                        padding: '16px',
                        minWidth: '100px',
                        minHeight: '50px',
                        zIndex: 2147483647,
                        outline: 'none',
                    }}
                    onBlur={(e) => {
                        console.log("Blur event triggered on text input");
                        handleTextAreaBlur(e);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                        if (e.key === 'Escape') {
                            setTextInput(null);
                        }
                    }}
                />,
                document.body
            )}

            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                className="w-full h-full cursor-crosshair touch-none"
            />
        </div>
    );
};

export default Whiteboard;
