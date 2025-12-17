import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import "./styles/ToolbarEditor.css";
import 'purecss/build/pure-min.css';
import { getImprovementStream } from "../utils/improvement";
import * as Diff from 'diff';
import { EditorSelectionData, Options } from "../types";
import { X } from 'lucide-preact';
import { postProcessToken } from '../utils/helper';

interface ToolbarEditorProps {
  data: EditorSelectionData,
  action: { name: string, prompt: string, icon: string, onClick?: string },
  options: Options,
  signal: AbortSignal,
  onClose?: () => void
}

export const ToolbarEditor = ({ data, action, signal, options, onClose }: ToolbarEditorProps) => {
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [diffs, setDiffs] = useState<Diff.Change[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const run = async () => {
      onRegenerate();
    }
    run();
  }, []);

  useEffect(() => {
    const handleUp = () => setDragging(false);
    const handleMove = (e: MouseEvent) => {
      if (dragging) {
        const container = document.getElementById('copilot-toolbar-editor');
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
    // Only drag when clicking the header background, not buttons
    if ((e.target as HTMLElement).closest('.toolbar-editor-action')) return;

    const container = document.getElementById('copilot-toolbar-editor');
    if (container) {
      const rect = container.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setDragging(true);
    }
  };

  const onRegenerate = async () => {
    if (loading) return;
    setShowDiff(false);
    setContent("");
    setLoading(true);
    try {
      const stream = getImprovementStream(data.content, action.prompt, options, signal);
      for await (const chunk of stream) {
        setContent((prev) => prev + chunk.content);
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      }
    } catch (err) {
      console.error("Improvement error:", err);
    } finally {
      setLoading(false);
    }
  }

  const onReplace = () => {
    if (loading) return;

    // Clean content before replacing
    const cleanContent = postProcessToken(content);

    window.dispatchEvent(
      new CustomEvent('copilot:editor:replace', {
        detail: {
          content: cleanContent,
          from: data.from,
          to: data.to,
        },
      })
    );
    // Close after replacing
    handleClose();
  }

  const onInsert = () => {
    if (loading) return;

    // Clean content before inserting
    const cleanContent = postProcessToken(content);

    window.dispatchEvent(
      new CustomEvent('copilot:editor:insert', {
        detail: {
          content: cleanContent,
          pos: data.head ?? data.to // Insert at cursor (head) or end of selection (to)
        },
      })
    );
    // Close after inserting
    handleClose();
  }

  const handleClose = () => {
    document.getElementById('copilot-toolbar-editor')?.remove();
    onClose?.();
  }

  const onToggleDiff = () => {
    if (!showDiff) {
      // Calculate diffs
      if (content && data.content.selection) {
        const charDiff = Diff.diffChars(data.content.selection, content);
        if (charDiff.length <= 100) {
          setDiffs(charDiff);
        } else {
          const wordDiffs = Diff.diffWordsWithSpace(data.content.selection, content);
          setDiffs(wordDiffs);
        }
      }
    }
    setShowDiff(!showDiff)
  }

  return <div class="rtoolbar-editor-containe">
    <div class="pure-g toolbar-editor-header" onMouseDown={startDrag as any}>
      <span class="pure-u-1-4 header-title">
        <Icon name={action.icon || "sparkles"} size={16} />
        <span style={{ marginLeft: '8px' }}>{action.name ?? "Rewrite"}</span>
      </span>
      <span class="pure-u-3-4 toolbar-editor-header-actions">
        <div className={loading ? "disabled toolbar-editor-action" : "toolbar-editor-action"} onClick={onToggleDiff}>
          <span><Icon name={showDiff ? "eye-off" : "eye"} size={14} /></span>
          <span>{showDiff ? "Hide diff" : "Show diff"}</span>
        </div>
        <div className={loading ? "disabled toolbar-editor-action" : "toolbar-editor-action"} onClick={onRegenerate}>
          <span><Icon name="rotate-ccw" size={14} /></span>
          <span>Regenerate</span>
        </div>
        {action.onClick === 'insert' ? (
          <div className={loading ? "disabled toolbar-editor-action" : "toolbar-editor-action"} onClick={onInsert}>
            <span><Icon name="arrow-right" size={14} /></span>
            <span>Insert</span>
          </div>
        ) : (
          <div className={loading ? "disabled toolbar-editor-action" : "toolbar-editor-action"} onClick={onReplace}>
            <span><Icon name="check" size={14} /></span>
            <span>Replace</span>
          </div>
        )}
        <div className="toolbar-editor-action toolbar-editor-close" onClick={(e) => { e.stopPropagation(); handleClose(); }} title="Close">
          <span><X size={16} /></span>
        </div>
      </span>
    </div >
    {showDiff ?
      <div className="toolbar-editor-diff-view">
        {diffs.map((d, i) => {
          if (d.added) {
            return <span key={i} className="toolbar-editor-diff-added">{d.value}</span>
          } else if (d.removed) {
            return <s key={i} className="toolbar-editor-diff-removed">{d.value}</s>
          } else {
            return <span key={i}>{d.value}</span>
          }
        })}
      </div> :
      <textarea
        ref={textareaRef}
        disabled={loading}
        placeholder={"Generating..."}
        value={content}
        onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
      />}
  </div >
}

export type ToolbarPosition = "up" | "down";