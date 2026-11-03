import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {detail && <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>}
    </Card>
  );
}
