import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Keep onCloseRef updated with the latest onClose callback
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Save previous active element to restore focus on close
    const previousActiveElement = document.activeElement as HTMLElement;

    // Trap Focus
    const focusableElementsString = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modalElement = modalRef.current;
    
    if (modalElement) {
      const focusableElements = modalElement.querySelectorAll(focusableElementsString);
      const firstFocusableElement = focusableElements[0] as HTMLElement;
      const lastFocusableElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      // Focus first focusable element
      if (firstFocusableElement) {
        firstFocusableElement.focus();
      }

      const handleFocusTrap = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) { // Shift + Tab
          if (document.activeElement === firstFocusableElement) {
            lastFocusableElement.focus();
            e.preventDefault();
          }
        } else { // Tab
          if (document.activeElement === lastFocusableElement) {
            firstFocusableElement.focus();
            e.preventDefault();
          }
        }
      };

      modalElement.addEventListener('keydown', handleFocusTrap);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        modalElement.removeEventListener('keydown', handleFocusTrap);
        if (previousActiveElement) {
          previousActiveElement.focus();
        }
      };
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      {/* Dialog container */}
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl z-10 relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="absolute top-[-50px] right-[-50px] w-32 h-32 rounded-full bg-blue-500/5 blur-[50px] pointer-events-none" />
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-200 p-1.5 hover:bg-slate-800/50 rounded-xl transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}
