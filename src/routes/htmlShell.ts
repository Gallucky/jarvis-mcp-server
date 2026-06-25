export function htmlShell(title: string, bundle: string, dir: "rtl" | "ltr" = "rtl", lang = "he"): string {
    return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="/${bundle}.css" />
</head>
<body>
  <div id="root"></div>
  <script src="/${bundle}.js"></script>
</body>
</html>`;
}
