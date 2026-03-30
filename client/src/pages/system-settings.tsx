import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, Globe } from "lucide-react";

interface SystemSetting {
  key: string;
  value: string;
}

export default function SystemSettingsPage() {
  const { toast } = useToast();

  const { data: settings = [], isLoading } = useQuery<SystemSetting[]>({
    queryKey: ["/api/system-settings"],
    staleTime: 30_000,
  });

  const getValue = (key: string) => {
    const row = settings.find((s) => s.key === key);
    return row?.value === "true";
  };

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest("PATCH", `/api/system-settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({ title: "설정이 저장되었습니다." });
    },
    onError: () => {
      toast({ title: "저장 실패", description: "잠시 후 다시 시도해주세요.", variant: "destructive" });
    },
  });

  const handleToggle = (key: string, current: boolean) => {
    mutation.mutate({ key, value: String(!current) });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">시스템 설정</h1>
          <p className="text-sm text-muted-foreground">서비스 전반의 시스템 동작을 제어합니다.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" />
            공개 대시보드
          </CardTitle>
          <CardDescription>
            외부 방문자가 접근 가능한 공개 대시보드 페이지의 활성화 여부를 제어합니다.
            OFF 상태에서는 &ldquo;서비스 준비 중&rdquo; 메시지가 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-11 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Switch
                id="public-dashboard-toggle"
                data-testid="toggle-public-dashboard"
                checked={getValue("public_dashboard_enabled")}
                onCheckedChange={() =>
                  handleToggle("public_dashboard_enabled", getValue("public_dashboard_enabled"))
                }
                disabled={mutation.isPending}
              />
              <Label htmlFor="public-dashboard-toggle" className="cursor-pointer select-none">
                {getValue("public_dashboard_enabled") ? (
                  <span className="text-green-600 font-semibold">ON — 공개 대시보드 활성화</span>
                ) : (
                  <span className="text-muted-foreground">OFF — 서비스 준비 중 표시</span>
                )}
              </Label>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
