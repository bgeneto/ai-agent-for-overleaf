
import { h } from 'preact';
import { Bot, Sparkles, Pencil, Search, Settings, Loader, Wrench, MessageSquareText } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './styles/StatusBadge.css';

import { Icon } from "./Icon";
import { ToolbarAction } from '../types';

interface StatusBadgeProps {
    onContinue: () => void;
    onCustomTask: () => void;
    onImprove: () => void;
    onFix: () => void;
    onAction: (action: ToolbarAction) => void;
    onSearch: () => void;
    hasSelection: boolean;
    isLoading: boolean;
    actions: ToolbarAction[];
}

export const StatusBadge = ({ onContinue, onCustomTask, onImprove, onFix, onAction, onSearch, hasSelection, isLoading, actions }: StatusBadgeProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContinue = () => {
        setMenuOpen(false);
        onContinue();
    };

    const handleCustomTask = () => {
        setMenuOpen(false);
        onCustomTask();
    };

    const handleImprove = () => {
        if (!hasSelection) return;
        setMenuOpen(false);
        onImprove();
    };

    const handleActionClick = (action: ToolbarAction) => {
        if (!hasSelection) return;
        setMenuOpen(false);
        onAction(action);
    };

    const handleSearch = () => {
        if (!hasSelection) return;
        setMenuOpen(false);
        onSearch();
    };

    const handleSettings = () => {
        setMenuOpen(false);
        chrome.runtime.sendMessage({ type: 'open-options' });
    };

    return (
        <div class="copilot-status-badge" ref={ref}>
            {menuOpen && (
                <div class="copilot-status-menu">
                    <div class="copilot-status-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={handleContinue}>
                        <div class="copilot-status-menu-item-icon complete">
                            <Sparkles size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Continue Writing</span>
                    </div>

                    <div class="copilot-status-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={handleCustomTask}>
                        <div class="copilot-status-menu-item-icon search">
                            <MessageSquareText size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Custom Task</span>
                    </div>

                    <div class="copilot-status-menu-item" onClick={() => { setMenuOpen(false); onAction({ name: "Explain Error", icon: "lightbulb", prompt: "EXPLAIN_ERROR", onClick: "show_editor" }); }} title="Explain compilation error">
                        <div class="copilot-status-menu-item-icon search">
                            {/* Using lightbulb with amber color */}
                            <div style={{ color: '#f59e0b' }}><Icon name="lightbulb" size={14} /></div>
                        </div>
                        <span class="copilot-status-menu-item-text">Explain Error</span>
                    </div>

                    <div class={`copilot-status-menu-item ${!hasSelection ? 'disabled' : ''}`} onClick={handleSearch} title={!hasSelection ? 'Select text first' : ''}>
                        <div class="copilot-status-menu-item-icon search">
                            <Search size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Find Similar Papers</span>
                    </div>

                    <div class={`copilot-status-menu-item ${!hasSelection ? 'disabled' : ''}`} onClick={() => { if (hasSelection) { setMenuOpen(false); onFix(); } }} title={!hasSelection ? 'Select text first' : ''}>
                        <div class="copilot-status-menu-item-icon improve">
                            <Wrench size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Fix LaTeX</span>
                    </div>

                    <div class={`copilot-status-menu-item ${!hasSelection ? 'disabled' : ''}`} onClick={handleImprove} title={!hasSelection ? 'Select text first' : ''}>
                        <div class="copilot-status-menu-item-icon improve">
                            <Pencil size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Improve Writing</span>
                    </div>

                    {actions.map((action, index) => (
                        <div key={index} class={`copilot-status-menu-item ${!hasSelection ? 'disabled' : ''}`}
                            onClick={() => handleActionClick(action)}
                            title={!hasSelection ? 'Select text first' : ''}>
                            <div class="copilot-status-menu-item-icon improve">
                                <Icon name={action.icon} size={14} />
                            </div>
                            <span class="copilot-status-menu-item-text">{action.name || "Action"}</span>
                        </div>
                    ))}
                    <div class="copilot-status-menu-divider" />
                    <div class="copilot-status-menu-item" onClick={handleSettings}>
                        <div class="copilot-status-menu-item-icon settings">
                            <Settings size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Settings</span>
                    </div>
                </div>
            )}
            <div class="copilot-status-badge-button" onClick={() => setMenuOpen(!menuOpen)} title="AI Agent for Overleaf Menu">
                <div class={`copilot-status-badge-icon ${isLoading ? 'loading' : ''}`}>
                    {isLoading ? <Loader size={12} /> : <Bot size={12} />}
                </div>
                <span class="copilot-status-badge-text">{isLoading ? 'Working...' : 'AI Agent'}</span>
            </div>
        </div>
    );
};
