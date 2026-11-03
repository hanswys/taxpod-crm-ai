import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-2 py-12 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted.{" "}
        <Link href="/" className="underline">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}
