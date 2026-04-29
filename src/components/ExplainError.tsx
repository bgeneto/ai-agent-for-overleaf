import { Fragment } from "preact/jsx-runtime";
import { useEffect, useState } from "preact/hooks";
import { X } from "lucide-preact";
import { getImprovementStream } from "../utils/improvement";
import { marked } from "marked";
import DOMPurify from 'dompurify';
import { Options } from "../types";
import { PROMPTS } from "../prompts";
import { postProcessToken } from "../utils/helper";

export interface ExplainErrorProps {
    errorCtx: string;
    errorTitle?: string;
    options: Options;
    onClose: () => void;
}

export const ExplainError = ({ errorCtx, errorTitle, options, onClose }: ExplainErrorProps) => {
    const [content, setContent] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const run = async () => {
            const controller = new AbortController();

            try {
                setError("");
                const prompt = options.explainErrorPrompt || PROMPTS.EXPLAIN_ERROR;
                const finalPrompt = prompt
                    .replace("{{error_title}}", errorTitle || "Error")
                    .replace("{{error_context}}", errorCtx)
                    .replace("{{error}}", errorCtx); // Support both for backward compatibility

                // Using existing getImprovementStream but repurposed for explanation
                // We'll pass the error context as 'content' and a custom prompt
                const stream = getImprovementStream({ selection: errorCtx, before: "", after: "" }, finalPrompt, options, controller.signal);

                for await (const chunk of stream) {
                    if (chunk.kind === 'error') {
                        setError(chunk.content);
                        break;
                    }

                    setContent((prev) => postProcessToken(prev + chunk.content));
                    setLoading(false);

                    // Scroll to bottom
                    const container = document.getElementById('copilot-explain-error-content');
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                    }
                }
            } catch (err) {
                console.error("Error generating explanation:", err);
                setError("Failed to generate explanation. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        run();
    }, [errorCtx]);

    return (
        <Fragment>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>Error Explanation</h3>
                <div
                    onClick={onClose}
                    style={{ cursor: 'pointer', padding: '5px' }}
                    title="Close"
                >
                    <X size={20} />
                </div>
            </div>

            <div id="copilot-explain-error-container" style={{ height: 'calc(100% - 50px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {loading && content === "" ? (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '50px' }}>
                        <div className="loading" />
                    </div>
                ) : (
                    <>
                        {error && <div style={{ color: '#b42318', marginBottom: '10px' }}>{error}</div>}
                        <div
                            id="copilot-explain-error-content"
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                paddingRight: '5px',
                                lineHeight: '1.5',
                                fontSize: '14px'
                            }}
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(content) as string) }}
                        />
                    </>
                )}
            </div>
        </Fragment>
    );
};
