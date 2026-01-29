import Link from 'next/link';

export default function OfferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-[#1e3a5f]">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
              <span className="text-2xl font-bold text-[#1e3a5f]">A</span>
            </div>
            <div className="text-white">
              <p className="text-xl font-bold tracking-wide">ALAMEDA MORTGAGE</p>
              <p className="text-xs text-blue-200">Investment Property Specialists</p>
            </div>
          </Link>
          <div className="text-right text-white">
            <p className="text-sm text-blue-200">Questions? Call us</p>
            <p className="text-lg font-semibold">(510) 555-0123</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-[#1e3a5f] py-8">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-blue-200">
          <p className="font-medium text-white">Alameda Mortgage Corporation</p>
          <p className="mt-1">NMLS #123456 | California DRE #01234567 | Equal Housing Lender</p>
          <p className="mt-3 text-xs">
            This is not a commitment to lend. All loans subject to property appraisal and final underwriting approval.
            Rates and terms subject to change without notice.
          </p>
        </div>
      </footer>
    </div>
  );
}
