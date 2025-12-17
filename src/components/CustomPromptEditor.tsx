import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import "./styles/CustomPromptEditor.css";
import 'purecss/build/pure-min.css';
import { getImprovementStream } from "../utils/improvement";
import { EditorSelectionData, Options } from "../types";
import { X, ChevronDown, ChevronUp, Send, RotateCcw } from 'lucide-preact';
import { postProcessToken } from '../utils/helper';
import { PROMPTS } from '../prompts';

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
            // Build the selected text section if there's a selection
            const selectedTextSection = hasSelection
                ? `
### LaTeX content ###
${data!.content.selection}
### End of LaTeX content ###
`
                : '';

            // Build the full prompt using centralized template
            const fullPrompt = PROMPTS.CUSTOM_TASK
                .replace('{{userInstruction}}', userPrompt)
                .replace('{{selectedTextSection}}', selectedTextSection);

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
            // Build the selected text section if there's a selection
            const selectedTextSection = hasSelection
                ? `
### LaTeX content ###
${data!.content.selection}
### End of LaTeX content ###
`
                : '';

            // Build the full prompt using centralized template
            const fullPrompt = PROMPTS.CUSTOM_TASK
                .replace('{{userInstruction}}', userPrompt)
                .replace('{{selectedTextSection}}', selectedTextSection);

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

    const onReplace = () => {
        if (loading || !hasSelection || !data) return;

        const cleanContent = postProcessToken(content);
        window.dispatchEvent(
            createCrossContextEvent('copilot:editor:replace', {
                content: cleanContent,
                from: data.from,
                to: data.to,
            })
        );
        handleClose();
    };

    const onInsert = () => {
        if (loading) return;

        const cleanContent = postProcessToken(content);
        // Always insert after the selection (data.to) with two newlines for LaTeX
        const insertPos = data?.to ?? 0;
        window.dispatchEvent(
            createCrossContextEvent('copilot:editor:insert', {
                content: '\n\n' + cleanContent,
                pos: insertPos
            })
        );
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
                            {hasSelection && (
                                <div className={loading ? "disabled custom-prompt-action" : "custom-prompt-action"} onClick={onReplace}>
                                    <span><Icon name="check" size={14} /></span>
                                    <span>Replace</span>
                                </div>
                            )}
                            <div className={loading ? "disabled custom-prompt-action" : "custom-prompt-action"} onClick={onInsert}>
                                <span><Icon name="arrow-right" size={14} /></span>
                                <span>Insert</span>
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

                    {/* Generate button */}
                    <div class="custom-prompt-options">
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
