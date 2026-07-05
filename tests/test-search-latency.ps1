$key = 'ed5143d838e90caec5afa3fab3581a3e9280747182cfd87279cb33b275426ca8'
$headers = @{ Authorization = "Bearer $key" }
$queries = @('jarvis', 'psychometric', 'distillation', 'test', 'note')

foreach ($q in $queries) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $url = "http://127.0.0.1:27123/search/simple/?query=$q&contextLength=100"
    $r = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -ErrorAction SilentlyContinue
    $sw.Stop()
    $count = if ($r) { $r.Count } else { 0 }
    Write-Host "query='$q' results=$count time=$($sw.ElapsedMilliseconds)ms"
}
