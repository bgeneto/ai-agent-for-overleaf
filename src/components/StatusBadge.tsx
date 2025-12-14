import { h } from 'preact';
import { Bot, Sparkles, Pencil, Search, Settings, Loader } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './styles/StatusBadge.css';

interface StatusBadgeProps {
    onComplete: () => void;
    onImprove: () => void;
    onSearch: () => void;
    hasSelection: boolean;
    isLoading: boolean;
}

export const StatusBadge = ({ onComplete, onImprove, onSearch, hasSelection, isLoading }: StatusBadgeProps) => {
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

    const handleComplete = () => {
        setMenuOpen(false);
        onComplete();
    };

    const handleImprove = () => {
        if (!hasSelection) return;
        setMenuOpen(false);
        onImprove();
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
                    <div class="copilot-status-menu-item" onClick={handleComplete}>
                        <div class="copilot-status-menu-item-icon complete">
                            <Sparkles size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Complete at Cursor</span>
                    </div>
                    <div class={`copilot-status-menu-item ${!hasSelection ? 'disabled' : ''}`} onClick={handleImprove} title={!hasSelection ? 'Select text first' : ''}>
                        <div class="copilot-status-menu-item-icon improve">
                            <Pencil size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Improve Writing</span>
                    </div>
                    <div class={`copilot-status-menu-item ${!hasSelection ? 'disabled' : ''}`} onClick={handleSearch} title={!hasSelection ? 'Select text first' : ''}>
                        <div class="copilot-status-menu-item-icon search">
                            <Search size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Find Similar Papers</span>
                    </div>
                    <div class="copilot-status-menu-divider" />
                    <div class="copilot-status-menu-item" onClick={handleSettings}>
                        <div class="copilot-status-menu-item-icon settings">
                            <Settings size={14} />
                        </div>
                        <span class="copilot-status-menu-item-text">Settings</span>
                    </div>
                </div>
            )}
            <div class="copilot-status-badge-button" onClick={() => setMenuOpen(!menuOpen)} title="Overleaf Copilot Menu">
                <div class={`copilot-status-badge-icon ${isLoading ? 'loading' : ''}`}>
                    {isLoading ? <Loader size={12} /> : <Bot size={12} />}
                </div>
                <span class="copilot-status-badge-text">{isLoading ? 'Working...' : 'Copilot'}</span>
            </div>
        </div>
    );
};
