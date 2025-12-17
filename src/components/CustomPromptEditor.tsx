import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import "./styles/CustomPromptEditor.css";
import 'purecss/build/pure-min.css';
import { getImprovementStream } from "../utils/improvement";
import { EditorSelectionData, Options } from "../types";
import { X, ChevronDown, ChevronUp, Send, RotateCcw } from 'lucide-preact';
import { postProcessToken } from '../utils/helper';

// Declare Firefox-specific function
declare function cloneInto<T>(obj: T, targetScope: any, options?: { cloneFunctions?: boolean }): T;

// Helper function to create Firefox-safe CustomEvents for cross-context communication
function createCrossContextEvent(eventName: string, detail: any): CustomEvent {
    const win = window as any;
    if (win.wrappedJSObject) {
        const eventId = `__copilot_event_${Date.now()}_${Math.random()}`;
        try {
            win.wrappedJSObject[eventId] = cloneInto(detail, win.wrappedJSObject);
        } catch (e) {
            win.wrappedJSObject[eventId] = detail;
        }
        return new CustomEvent(eventName, {
            bubbles: true,
            composed: true,
            detail: eventId
        });
    }
    return new CustomEvent(eventName, {
        bubbles: true,
        composed: true,
        detail: detail,
    });
}

interface CustomPromptEditorProps {
    data: EditorSelectionData | null;
    options: Options;
    signal: AbortSignal;
    onClose?: () => void;
}

export const CustomPromptEditor = ({ data, options, signal, onClose }: CustomPromptEditorProps) => {
    const [dragging, setDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [loading, setLoading] = useState(false);
    const [userPrompt, setUserPrompt] = useState("");
    const [content, setContent] = useState("");
    const [phase, setPhase] = useState<"input" | "output">("input");
    const [replaceSelection, setReplaceSelection] = useState(!!data?.content?.selection?.trim());
    const [contextExpanded, setContextExpanded] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const promptInputRef = useRef<HTMLTextAreaElement>(null);

    const hasSelection = !!data?.content?.selection?.trim();

    useEffect(() => {
        // Focus the prompt input on mount
        promptInputRef.current?.focus();
    }, []);

    useEffect(() => {
        const handleUp = () => setDragging(false);
        const handleMove = (e: MouseEvent) => {
            if (dragging) {
                const container = document.getElementById('copilot-custom-prompt-editor');
                if (container) {
                    container.style.left = `${e.clientX - dragOffset.x}px`;
                    container.style.top = `${e.clientY - dragOffset.y}px`;
                }
            }
        };

        if (dragging) {
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('mousemove', handleMove);
        }

        return () => {
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('mousemove', handleMove);
        };
    }, [dragging, dragOffset]);

    const startDrag = (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.custom-prompt-action')) return;

        const container = document.getElementById('copilot-custom-prompt-editor');
        if (container) {
            const rect = container.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
            setDragging(true);
        }
    };

    const onGenerate = async () => {
        if (loading || !userPrompt.trim()) return;

        setPhase("output");
        setContent("");
        setLoading(true);

        try {
            // Build the prompt with context
            let fullPrompt = `You are a LaTeX expert assistant. The user has the following request:

### User Instruction ###
${userPrompt}
### End of Instruction ###
`;

            if (hasSelection) {
                fullPrompt += `
### Selected Text (Context) ###
${data!.content.selection}
### End of Selected Text ###
`;
            }

            fullPrompt += `
RULES:
- Output ONLY valid LaTeX code.
- No explanations, comments, markdown fences, or preambles.
- Detect and match the language of the text automatically.
- Start immediately with the LaTeX content.

Generate the requested LaTeX content.`;

            const stream = getImprovementStream(
                { selection: hasSelection ? data!.content.selection : "", before: "", after: "" },
                fullPrompt,
                options,
                signal
            );

            for await (const chunk of stream) {
                setContent((prev) => prev + chunk.content);
                if (textareaRef.current) {
                    textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
                }
            }
        } catch (err) {
            // Error handled silently
        } finally {
            setLoading(false);
        }
    };

    const onRegenerate = async () => {
        if (loading) return;
        setContent("");
        setLoading(true);

        try {
            let fullPrompt = `You are a LaTeX expert assistant. The user has the following request:

### User Instruction ###
${userPrompt}
### End of Instruction ###
`;

            if (hasSelection) {
                fullPrompt += `
### Selected Text (Context) ###
${data!.content.selection}
### End of Selected Text ###
`;
            }

            fullPrompt += `
RULES:
- Output ONLY valid LaTeX code.
- No explanations, comments, markdown fences, or preambles.
- Detect and match the language of the text automatically.
- Start immediately with the LaTeX content.

Generate the requested LaTeX content.`;

            const stream = getImprovementStream(
                { selection: hasSelection ? data!.content.selection : "", before: "", after: "" },
                fullPrompt,
                options,
                signal
            );

            for await (const chunk of stream) {
                setContent((prev) => prev + chunk.content);
                if (textareaRef.current) {
                    textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
                }
            }
        } catch (err) {
            // Error handled silently
        } finally {
            setLoading(false);
        }
    };

    const onInsertOrReplace = () => {
        if (loading) return;

        const cleanContent = postProcessToken(content);

        if (replaceSelection && hasSelection && data) {
            // Replace the selection
            window.dispatchEvent(
                createCrossContextEvent('copilot:editor:replace', {
                    content: cleanContent,
                    from: data.from,
                    to: data.to,
                })
            );
        } else {
            // Insert at cursor position
            const insertPos = data?.head ?? data?.to ?? 0;
            window.dispatchEvent(
                createCrossContextEvent('copilot:editor:insert', {
                    content: cleanContent,
                    pos: insertPos
                })
            );
        }
        handleClose();
    };

    const handleClose = () => {
        document.getElementById('copilot-custom-prompt-editor')?.remove();
        onClose?.();
    };

    const onBackToInput = () => {
        setPhase("input");
        setContent("");
    };

    return (
        <div class="custom-prompt-container">
            <div class="pure-g custom-prompt-header" onMouseDown={startDrag as any}>
                <span class="pure-u-1-3 header-title">
                    <Icon name="message-square-text" size={16} />
                    <span style={{ marginLeft: '8px' }}>Custom Task</span>
                </span>
                <span class="pure-u-2-3 custom-prompt-header-actions">
                    {phase === "output" && (
                        <>
                            <div className={loading ? "disabled custom-prompt-action" : "custom-prompt-action"} onClick={onBackToInput} title="Edit prompt">
                                <span><Icon name="arrow-left" size={14} /></span>
                                <span>Edit</span>
                            </div>
                            <div className={loading ? "disabled custom-prompt-action" : "custom-prompt-action"} onClick={onRegenerate}>
                                <span><RotateCcw size={14} /></span>
                                <span>Regenerate</span>
                            </div>
                            <div className={loading ? "disabled custom-prompt-action primary" : "custom-prompt-action primary"} onClick={onInsertOrReplace}>
                                <span><Icon name={replaceSelection && hasSelection ? "check" : "arrow-right"} size={14} /></span>
                                <span>{replaceSelection && hasSelection ? "Replace" : "Insert"}</span>
                            </div>
                        </>
                    )}
                    <div className="custom-prompt-action custom-prompt-close" onClick={(e) => { e.stopPropagation(); handleClose(); }} title="Close">
                        <span><X size={16} /></span>
                    </div>
                </span>
            </div>

            {phase === "input" ? (
                <div class="custom-prompt-input-phase">
                    {/* Context display */}
                    {hasSelection && (
                        <div class="custom-prompt-context">
                            <div class="custom-prompt-context-header" onClick={() => setContextExpanded(!contextExpanded)}>
                                <span class="context-label">Selected Text (context)</span>
                                <span class="context-toggle">
                                    {contextExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </span>
                            </div>
                            {contextExpanded && (
                                <div class="custom-prompt-context-content">
                                    {data!.content.selection}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Prompt input */}
                    <textarea
                        ref={promptInputRef}
                        class="custom-prompt-textarea"
                        placeholder="e.g., Translate to French, Create a 3x4 LaTeX table, Typeset the quadratic formula..."
                        value={userPrompt}
                        onInput={(e) => setUserPrompt((e.target as HTMLTextAreaElement).value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                onGenerate();
                            }
                        }}
                    />

                    {/* Options row */}
                    <div class="custom-prompt-options">
                        <label class={`custom-prompt-checkbox-label ${!hasSelection ? 'disabled' : ''}`}>
                            <input
                                type="checkbox"
                                checked={replaceSelection}
                                disabled={!hasSelection}
                                onChange={(e) => setReplaceSelection((e.target as HTMLInputElement).checked)}
                            />
                            <span>Replace selection</span>
                        </label>
                        <button
                            class="custom-prompt-generate-btn"
                            onClick={onGenerate}
                            disabled={!userPrompt.trim()}
                            title="Ctrl+Enter to generate"
                        >
                            <Send size={14} />
                            <span>Generate</span>
                        </button>
                    </div>
                </div>
            ) : (
                <textarea
                    ref={textareaRef}
                    class="custom-prompt-output-textarea"
                    disabled={loading}
                    placeholder={"Generating..."}
                    value={content}
                    onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
                />
            )}
        </div>
    );
};
