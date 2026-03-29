import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-accent mb-4">404</p>
        <h1 className="text-xl font-semibold text-white mb-2">Page not found</h1>
        <p className="text-text-secondary text-sm mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/today"
          className="inline-block px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
