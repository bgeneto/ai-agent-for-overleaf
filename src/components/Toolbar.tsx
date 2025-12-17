import { Fragment } from "preact/jsx-runtime";
import { Icon } from "./Icon";
import { EditorSelectionData, Options, ToolbarAction } from "../types";
import { getImprovement } from "../utils/improvement";
import { useState } from "preact/hooks";
import "./styles/Toolbar.css";

// Declare Firefox-specific function
declare function cloneInto<T>(obj: T, targetScope: any, options?: { cloneFunctions?: boolean }): T;

// Helper function to create Firefox-safe CustomEvents for cross-context communication
// Firefox blocks ALL property access on event.detail when crossing from isolated to main world
// Solution: Use wrappedJSObject to temporarily store data on the page's window object
function createCrossContextEvent(eventName: string, detail: any): CustomEvent {
  // Check if we're in Firefox (has wrappedJSObject)
  const win = window as any;
  if (win.wrappedJSObject) {
    // Store data temporarily on the page's window object
    const eventId = `__copilot_event_${Date.now()}_${Math.random()}`;
    try {
      win.wrappedJSObject[eventId] = cloneInto(detail, win.wrappedJSObject);
    } catch (e) {
      // If cloneInto fails, try direct assignment
      win.wrappedJSObject[eventId] = detail;
    }

    return new CustomEvent(eventName, {
      bubbles: true,
      composed: true,
      detail: eventId // Just pass the ID string
    });
  }

  // Chrome/Edge: use direct detail
  return new CustomEvent(eventName, {
    bubbles: true,
    composed: true,
    detail: detail,
  });
}

export interface ToolbarProps {
  data: EditorSelectionData;
  actions: ToolbarAction[];
  searchDisabled: boolean;
  onShowEditor: (action: { name: string, prompt: string, icon: string }) => void;
  onClickSearch: () => void;
  signal: AbortSignal;
  options: Options;
}

export const Toolbar = ({ data, actions, searchDisabled, onShowEditor, onClickSearch, signal, options }: ToolbarProps) => {
  const [loading, setLoading] = useState(false);

  const onClick = async (action: ToolbarAction) => {
    if (loading) return;

    if (action.onClick === "replace") {
      setLoading(true);
      const content = await getImprovement(data.content, action.prompt, options, signal);
      setLoading(false);

      if (signal.aborted) return;
      window.dispatchEvent(
        createCrossContextEvent('copilot:editor:replace', {
          content: content,
          from: data.from,
          to: data.to,
        })
      );
      setLoading(false);
    } else {
      onShowEditor(action);
    }
  }

  return <Fragment>
    {actions.map(action => {
      return <div className={`copilot-toolbar-button ${loading ? "disabled" : ""}`} title={action.name ?? "Rewrite"} onClick={() => onClick(action)}>
        <Icon name={action.icon} size={16} />
      </div>
    })}
    {!searchDisabled && <div className="copilot-toolbar-button copilot-toolbar-search" title="Search" onClick={onClickSearch}>
      <Icon name="search" size={16} />
    </div>}
  </Fragment>
}