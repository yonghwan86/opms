import { useState, useRef } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadResult {
  row: number;
  status: "success" | "fail";
  reason?: string;
}

interface UploadResponse {
  successCount: number;
  failCount: number;
  results: UploadResult[];
}

export default function UsersUploadPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (f: File) => {
    if (!f.name.endsWith(".xlsx")) {
      toast({ title: "xlsx 파일만 업로드 가능합니다.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResponse(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/users/upload-excel", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "업로드 실패", description: data.message, variant: "destructive" });
        return;
      }
      setResponse(data);
      toast({ title: `업로드 완료: 성공 ${data.successCount}건, 실패 ${data.failCount}건` });
    } catch {
      toast({ title: "업로드 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.open("/api/users/upload-template", "_blank");
  };

  return (
    <Layout>
      <PageHeader title="사용자 엑셀 업로드" description="xlsx 파일로 사용자를 일괄 등록합니다.">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} data-testid="button-download-template">
          <Download className="w-4 h-4 mr-1" /> 샘플 템플릿 다운로드
        </Button>
      </PageHeader>

      <div className="p-6 space-y-6">
        {/* 안내 */}
        <Card className="border border-card-border p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">업로드 전 확인 사항</p>
              <ul className="text-sm text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>파일 형식은 반드시 <strong>.xlsx</strong>이어야 합니다.</li>
                <li>필수 컬럼: <strong>id</strong>, display_name(선택), position_name, headquarters_code, team_code, role, enabled</li>
                <li><strong>id</strong>는 로그인 시 사용할 아이디입니다 (영문/숫자/점/하이픈/언더스코어만 허용).</li>
                <li>headquarters_code, team_code는 시스템에 등록된 코드와 정확히 일치해야 합니다.</li>
                <li>role은 MASTER 또는 HQ_USER만 허용됩니다.</li>
                <li>비밀번호는 최초 로그인 시 사용자가 직접 설정합니다.</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 파일 업로드 영역 */}
        <Card className="border border-card-border">
          <div className="p-6">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                data-testid="input-file-upload"
              />
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground mb-1">
                {file ? file.name : "xlsx 파일을 드래그하거나 클릭하여 선택"}
              </p>
              <p className="text-xs text-muted-foreground">
                {file ? `파일 크기: ${(file.size / 1024).toFixed(1)} KB` : "Excel 파일(.xlsx)만 지원됩니다"}
              </p>
            </div>

            {file && (
              <div className="mt-4 flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setFile(null); setResponse(null); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-1"
                data-testid="button-upload-excel"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "업로드 중..." : "업로드 시작"}
              </Button>
            </div>
          </div>
        </Card>

        {/* 업로드 결과 */}
        {response && (
          <Card className="border border-card-border">
            <div className="px-5 py-4 border-b border-card-border">
              <h3 className="font-semibold text-sm">업로드 결과</h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-green-600">{response.successCount}</p>
                    <p className="text-sm text-muted-foreground">성공</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                  <XCircle className="w-8 h-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-red-500">{response.failCount}</p>
                    <p className="text-sm text-muted-foreground">실패</p>
                  </div>
                </div>
              </div>

              {response.results.filter(r => r.status === "fail").length > 0 && (
                <>
                  <Separator className="mb-4" />
                  <h4 className="text-sm font-medium mb-3">실패 상세</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {response.results.filter(r => r.status === "fail").map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 bg-muted/40 rounded-lg">
                        <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                        <span className="text-muted-foreground">행 {r.row}:</span>
                        <span className="text-foreground">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
