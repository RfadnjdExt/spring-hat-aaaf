let tokenCache: string | null = null;
let fileCache = new Map();

async function initialize() {
  if (tokenCache) return tokenCache;

  const cookies = new Map();
  let token = cookies.get('accountToken');
  if (!token) {
    const response = await fetch('https://api.gofile.io/accounts', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const accountData = await response.json();
    token = accountData.data.token;
    cookies.set('accountToken', token);
    tokenCache = token;  // Cache the token
  }
  return token;
}

async function entries(fileId: string, token: string, password?: string) {
  if (fileCache.has(fileId)) return fileCache.get(fileId);

  const files = await fetchFileEntriesFromAPI(fileId, token, password);
  fileCache.set(fileId, files);
  return files;
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    const fileIdMatch = url.match(/https:\/\/gofile\.io\/d\/([^/]+)/);
    if (!fileIdMatch || !fileIdMatch[1]) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });

    const fileId = fileIdMatch[1];
    const token = await initialize();
    const filePassword = request.nextUrl.searchParams.get('password');
    const fileEntries = await entries(fileId, token, filePassword ?? undefined);
    const file = fileEntries[0];

    const fileResponse = await fetch(file.url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!fileResponse.ok) return NextResponse.json({ error: 'Failed to download the file' }, { status: 500 });

    const fileStream = fileResponse.body;
    return new NextResponse(fileStream, {
      headers: {
        'Content-Type': file.mimetype,
        'Content-Disposition': `attachment; filename="${file.title}.${file.mimetype.split('/')[1]}"`,
      },
    });

  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
