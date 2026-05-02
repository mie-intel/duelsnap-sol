import { Suspense } from "react";
import Spinner from "../../../components/ui/Spinner";
import CasualPageClient from "./CasualPageClient";

function CasualPageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function CasualPage() {
  return (
    <Suspense fallback={<CasualPageFallback />}>
      <CasualPageClient />
    </Suspense>
  );
}
