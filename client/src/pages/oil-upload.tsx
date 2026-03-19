import { useState, useCallback, useRef } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";

interface FileUploadResult {
  success: boolean;
  fileName: string;
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

const CHUNK_SIZE = 200 * 1024; // 200KB 바이너리 → base64 약 267KB

function splitIntoChunks(ab: ArrayBuffer): string[] {
  const bytes = new Uint8Array(ab);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const slice = bytes.slice(offset, offset + CHUNK_SIZE);
    let binaryStr = "";
    for (let i = 0; i < slice.length; i++) binaryStr += String.fromCharCode(slice[i]);
    chunks.push(btoa(binaryStr));
  }
  if (chunks.length === 0) chunks.push("");
  return chunks;
}

async function uploadFileChuked(
  file: File,
  onProgress: (pct: number) => void
): Promise<FileUploadResult> {
  const ab = await file.arrayBuffer();
  const chunks = splitIntoChunks(ab);

  // 1. Init
  const initRes = await fetch("/api/oil-prices/upload-csv/init", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, totalChunks: chunks.length }),
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ message: "세션 생성 실패" }));
    throw new Error(err.message);
  }
  const { sessionId } = await initRes.json();

  // 2. 청크 전송
  for (let i = 0; i < chunks.length; i++) {
    const chunkRes = await fetch("/api/oil-prices/upload-csv/chunk", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, chunkIndex: i, data: chunks[i] }),
    });
    if (!chunkRes.ok) {
      const err = await chunkRes.json().catch(() => ({ message: "청크 전송 실패" }));
      throw new Error(err.message);
    }
    onProgress(Math.round(((i + 1) / chunks.length) * 90));
  }

  // 3. Finalize
  const finalRes = await fetch("/api/oil-prices/upload-csv/finalize", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const data = await finalRes.json();
  if (!finalRes.ok) throw new Error(data.message || "처리 실패");
  onProgress(100);
  return data as FileUploadResult;
}

const FUEL_TYPE_OPTIONS = [
  { value: "gasoline", label: "휘발유" },
  { value: "diesel", label: "경유" },
  { value: "kerosene", label: "등유" },
  { value: "premiumGasoline", label: "고급휘발유" },
];

interface SupplyUploadResult {
  ok: boolean;
  savedCount: number;
  fileName: string;
}

function SupplyPriceUploadSection() {
  const [fuelType, setFuelType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<SupplyUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!fuelType) {
      toast({ title: "유종을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "CSV 파일을 선택해주세요.", variant: "destructive" });
      return;
    }

    setIsPending(true);
    setResult(null);
    setError(null);

    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let binaryStr = "";
      for (let i = 0; i < bytes.length; i++) binaryStr += String.fromCharCode(bytes[i]);
      const base64 = btoa(binaryStr);

      const res = await fetch("/api/admin/supply-price/upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fuelType, data: base64, fileName: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "업로드 실패");

      setResult(data as SupplyUploadResult);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      toast({ title: "업로드 완료", description: `${data.savedCount}건 저장되었습니다.` });
    } catch (e: any) {
      setError(e.message || "업로드 중 오류가 발생했습니다.");
      toast({ title: "업로드 실패", description: e.message, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">정유사 공급가 업로드</h2>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">유종 선택</label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger data-testid="select-fuel-type-supply">
                  <SelectValue placeholder="유종 선택" />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">CSV 파일</label>
              <div
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-md cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => inputRef.current?.click()}
                data-testid="dropzone-supply-csv"
              >
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className={cn("text-sm truncate flex-1", file ? "text-foreground" : "text-muted-foreground")}>
                  {file ? file.name : "파일 선택…"}
                </span>
                {file && (
                  <button
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
                    data-testid="button-remove-supply-file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-supply-csv-file"
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={isPending || !fuelType || !file}
            data-testid="button-upload-supply-csv"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />업로드 중...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />공급가 업로드</>
            )}
          </Button>

          {result && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                <span className="font-semibold">{result.savedCount}건</span> 저장 완료 ({result.fileName})
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/30">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium">공급가 업로드 안내</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>오피넷 → 유가정보 → 정유사 공급가 → 회사별 공급가격에서 CSV 다운로드</li>
            <li>형식: <code className="bg-muted px-1 rounded text-[11px]">기간,SK에너지,GS칼텍스,HD현대오일뱅크,S-OIL</code></li>
            <li>유종별로 개별 업로드하세요. 같은 주차·회사 데이터는 해당 유종만 덮어씁니다.</li>
            <li>파일 인코딩은 EUC-KR 또는 UTF-8 모두 지원합니다.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OilUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [progress, setProgress] = useState<{ fileIndex: number; pct: number } | null>(null);
  const [results, setResults] = useState<FileUploadResult[]>([]);
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
    setResults([]);
    setError(null);
  }, [toast]);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResults([]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsPending(true);
    setResults([]);
    setError(null);
    setProgress({ fileIndex: 0, pct: 0 });

    try {
      const allResults: FileUploadResult[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress({ fileIndex: i, pct: 0 });
        const result = await uploadFileChuked(files[i], (pct) => {
          setProgress({ fileIndex: i, pct });
        });
        allResults.push(result);
      }
      setResults(allResults);
      setFiles([]);
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["/api/oil-prices/latest-date"] });
      const totalRows = allResults.reduce((s, r) => s + r.totalRows, 0);
      toast({ title: "업로드 완료", description: `총 ${totalRows.toLocaleString()}건 저장되었습니다.` });
    } catch (e: any) {
      setProgress(null);
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

              {/* 업로드 진행률 */}
              {progress && (
                <div className="pt-1 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    파일 {progress.fileIndex + 1}/{files.length + results.length} 업로드 중… {progress.pct}%
                  </p>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-200 rounded-full"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                </div>
              )}

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
        {results.length > 0 && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className="font-medium text-emerald-700 dark:text-emerald-400">업로드 완료 ({results.length}개 파일)</p>
              </div>
              {results.map((r, i) => (
                <div key={i} className="text-sm text-emerald-700 dark:text-emerald-400 space-y-0.5 pl-7">
                  <p className="font-semibold truncate">{r.fileName}</p>
                  <p>저장: <span className="font-semibold">{r.totalRows.toLocaleString()}건</span> / 분석: <span className="font-semibold">{r.analysisCount.toLocaleString()}건</span></p>
                  {r.dates.length > 0 && (
                    <p className="text-xs">날짜: {r.dates.map(formatDate).join(", ")}</p>
                  )}
                </div>
              ))}
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

        {/* 구분선 */}
        <div className="border-t border-border pt-2" />

        {/* 정유사 공급가 업로드 */}
        <SupplyPriceUploadSection />
      </div>
    </Layout>
  );
}
