// Import necessary modules for Next.js and Node.js
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface GofileResponse {
  data: {
    children: Record<string, GofileFile>;
  };
  status: string;
}

interface GofileFile {
  id: string;
  name: string;
  mimetype: string;
  link: string;
  size: number;
  createTime: number;
}

// Fetch account token from cookies or create a guest account
async function initialize() {
  let token = null;

  // In a real application, you'd get cookies here, for now, we simulate
  const cookies = new Map(); // Simulate cookies storage
  if (cookies.has('accountToken')) {
    token = cookies.get('accountToken');
  } else {
    const response = await fetch('https://api.gofile.io/accounts', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const accountData = await response.json();
    token = accountData.data.token;

    // Simulate setting a cookie
    cookies.set('accountToken', token);
  }

  return token;
}

// Function to handle entries for files
async function entries(fileId: string, token: string, password?: string) {
  const queryParams: any = { wt: '4fd6sg89d7s6' };
  
  if (password) {
    queryParams.password = crypto.createHash('sha256').update(password).digest('hex');
  }

  const url = new URL(`https://api.gofile.io/contents/${fileId}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value)); // Ensure value is a string
    }
  });


  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const files: GofileResponse = await response.json();

  const status = files.status;
  if (status === 'error-passwordRequired') {
    throw new Error('This video is protected by a password.');
  } else if (status !== 'ok') {
    throw new Error(`Gofile API error: status ${status}`);
  }

  const result = [];
  let foundFiles = false;
  for (const file of Object.values(files.data.children)) {
    const [fileType, fileFormat] = file.mimetype.split('/');
    if (fileType !== 'video' && fileType !== 'audio' && fileFormat !== 'vnd.mts') {
      continue;
    }

    foundFiles = true;
    if (file.link) {
      result.push({
        id: file.id,
        title: file.name.split('.').slice(0, -1).join('.'),
        url: file.link,
        filesize: file.size,
        release_timestamp: file.createTime,
      });
    }
  }

  if (!foundFiles) {
    throw new Error('No video/audio found at the provided URL.');
  }

  return result;
}

// Next.js API handler
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    // Extract the fileId from the URL using a regex pattern
    const fileIdMatch = url.match(/https:\/\/gofile\.io\/d\/([^/]+)/);
    if (!fileIdMatch || !fileIdMatch[1]) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    const fileId = fileIdMatch[1];

    // Initialize by fetching or creating the account token
    const token = await initialize();

    // Extract video password from request params if available
    const videoPassword = request.nextUrl.searchParams.get('videopassword');

    // Fetch file entries and return as a JSON response
    const fileEntries = await entries(fileId, token, videoPassword ?? undefined);
    return NextResponse.json(fileEntries);
  catch (error) {
    if (error instanceof Error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
        return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
    }
}
