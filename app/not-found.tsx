import { NotFoundScreen } from "@/components/shared/not-found-screen";

export default function NotFound() {
  return (
    <NotFoundScreen
      title="Page not found"
      description="This address does not match a Dayplan page. Return to Today or open Help to find your way."
      broad
    />
  );
}
