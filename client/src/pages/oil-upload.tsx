import { useState, useCallback, useRef } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface UploadResult {
  success: boolean;
  files: number;
  totalRows: number;
  analysisCount: number;
  dates: string[];
}

function formatDate(d: string) {
  if (d.length !== 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OilUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const csvFiles = Array.from(newFiles).filter(
      (f) => f.name.endsWith(".csv") || f.type === "text/csv"
    );
    if (csvFiles.length === 0) {
      toast({ title: "CSV 파일만 업로드할 수 있습니다.", variant: "destructive" });
      return;
    }
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const filtered = csvFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...filtered];
    });
    setResult(null);
    setError(null);
  }, [toast]);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // data:...;base64,XXXX → XXXX 부분만 추출
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsPending(true);
    setResult(null);
    setError(null);

    try {
      const filePayloads = await Promise.all(
        files.map(async (f) => ({ name: f.name, content: await readFileAsBase64(f) }))
      );

      const res = await fetch("/api/oil-prices/upload-csv", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filePayloads }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "업로드 실패");
      setResult(data);
      setFiles([]);
      queryClient.invalidateQueries({ queryKey: ["/api/oil-prices/latest-date"] });
      toast({ title: "업로드 완료", description: `${data.totalRows.toLocaleString()}건 저장되었습니다.` });
    } catch (e: any) {
      setError(e.message || "업로드 중 오류가 발생했습니다.");
      toast({ title: "업로드 실패", description: e.message, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="유가 CSV 업로드"
        description="오피넷에서 다운로드한 CSV 파일을 직접 업로드합니다. 여러 파일을 동시에 업로드할 수 있습니다."
      />

      <div className="p-6 max-w-3xl space-y-6">
        {/* 드래그앤드롭 영역 */}
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          data-testid="dropzone-csv"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            data-testid="input-csv-file"
          />
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            CSV 파일을 드래그하거나 클릭하여 선택하세요
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            오피넷 과거판매가격 CSV 형식 (EUC-KR), 여러 파일 동시 가능
          </p>
        </div>

        {/* 파일 목록 */}
        {files.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-foreground mb-3">
                선택된 파일 ({files.length}개)
              </p>
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/40"
                  data-testid={`file-item-${idx}`}
                >
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                    data-testid={`button-remove-file-${idx}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}

              <div className="pt-2">
                <Button
                  className="w-full"
                  onClick={handleUpload}
                  disabled={isPending}
                  data-testid="button-upload-csv"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {files.length}개 파일 업로드
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 결과 */}
        {result && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">업로드 완료</p>
                  <div className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
                    <p>파일 수: <span className="font-semibold">{result.files}개</span></p>
                    <p>저장된 원본 데이터: <span className="font-semibold">{result.totalRows.toLocaleString()}건</span></p>
                    <p>생성된 분석 결과: <span className="font-semibold">{result.analysisCount.toLocaleString()}건</span></p>
                    {result.dates.length > 0 && (
                      <p>처리된 날짜: <span className="font-semibold">{result.dates.map(formatDate).join(", ")}</span></p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 오류 */}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-destructive">업로드 실패</p>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 안내 */}
        <Card className="bg-muted/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">업로드 안내</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>오피넷(www.opinet.co.kr) → 과거판매가격 메뉴에서 다운로드한 CSV 파일을 사용하세요.</li>
              <li>파일 인코딩은 EUC-KR이어야 합니다 (오피넷 기본 형식).</li>
              <li>같은 주유소+날짜 데이터는 중복 저장되지 않습니다 (자동 덮어쓰기).</li>
              <li>여러 날짜 범위의 파일을 한 번에 올릴 수 있습니다.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
