import { h } from 'preact';
import { Bot, Check } from 'lucide-preact';
import { useState, useEffect } from 'preact/hooks';

export const StatusBadge = () => {
    const [active, setActive] = useState(true);

    return (
        <div style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            zIndex: 9999,
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '20px',
            padding: '5px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            fontSize: '12px',
            color: '#495057',
            transition: 'opacity 0.3s ease',
            opacity: active ? 1 : 0.5,
            cursor: 'default',
            userSelect: 'none'
        }}
            title="Overleaf Copilot is active"
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#28a745',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                color: 'white'
            }}>
                <Bot size={12} />
            </div>
            <span style={{ fontWeight: 600 }}>Copilot On</span>
        </div>
    );
};
