import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, containerClassName = '', id, ...props }, ref) => {
    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        {label && (
          <label htmlFor={id} className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          className={`w-full bg-slate-950/40 border ${error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500'} rounded-xl py-2.5 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-1 transition text-sm ${className}`}
          {...props}
        />
        {error && <span className="text-rose-400 text-xs mt-0.5">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
