import React from 'react';
import { ExpensesTab } from './Finance';

export default function Expenses() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Banner */}
      <div className="px-6 pt-4 pb-0"
        style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f766e 60%,#0d9488 100%)' }}>
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Daily Expenses</h1>
              <p className="text-teal-200 text-xs mt-0.5">Track · Categorise · Pay · Auto-post to Finance</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <ExpensesTab />
      </div>
    </div>
  );
}
