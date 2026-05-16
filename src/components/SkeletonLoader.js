import React from 'react';

export default function SkeletonLoader({ type = 'card' }) {
  if (type === 'table') {
    return (
      <div className="w-full space-y-4 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded-lg w-full" />
        ))}
      </div>
    );
  }

  if (type === 'stats') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white/5 rounded-2xl border border-white/10" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-48 bg-white/5 rounded-2xl border border-white/10" />
      ))}
    </div>
  );
}
