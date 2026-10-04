import Loading from "@/components/loading";

export default function RootLoading() {
  return (
    <Loading
      label="INITIALIZING RFQDECK..."
      subtext="CONNECTING SECURE GATEWAY"
      size="lg"
      fullScreen={true}
    />
  );
}
