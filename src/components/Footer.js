import React from 'react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0f0f1e] border-t border-white/5 mt-8 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-gray-400 text-sm">
            &copy; {currentYear} Velnix Markets. All rights reserved.
          </div>
          <div className="flex gap-6 items-center justify-center md:justify-end flex-wrap">
            <a
              href="/public/terms-of-service.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="/public/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="mailto:support@velnixhub.site"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
