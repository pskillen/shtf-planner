import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDriveApiClient } from './driveApi';
import {
  APP_ROOT_FOLDER_NAME,
  DRIVE_FOLDER_MIME,
  DriveAuthError,
  DriveNameConflictError,
  DriveNetworkError,
  DriveNotFoundError,
  DriveScopeError,
} from './driveTypes';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('driveApi', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => fetchMock.mockReset());
  const api = () => createDriveApiClient(fetchMock);
  const url = (n = 0) => String(fetchMock.mock.calls[n]?.[0]);
  const init = (n = 0) => fetchMock.mock.calls[n]?.[1];

  it('finds the app folder by name and folder type, oldest first', async () => {
    fetchMock.mockResolvedValueOnce(json({ files: [{ id: 'f1', name: APP_ROOT_FOLDER_NAME }] }));
    const found = await api().findAppFolders('tok');
    expect(found.map((f) => f.id)).toEqual(['f1']);
    const q = decodeURIComponent(url());
    expect(q).toContain(`name='${APP_ROOT_FOLDER_NAME}'`);
    expect(q).toContain(`mimeType='${DRIVE_FOLDER_MIME}'`);
    expect(q).toContain('orderBy=createdTime');
    expect((init()?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('lists the children of a folder', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ files: [{ id: 'a', name: 'household.yjs', modifiedTime: 't1' }, { id: '' }] }),
    );
    const files = await api().listChildren('folder-1', 'tok');
    expect(files).toEqual([{ id: 'a', name: 'household.yjs', modifiedTime: 't1' }]);
    expect(decodeURIComponent(url())).toContain("'folder-1' in parents");
    expect(decodeURIComponent(url())).toContain('orderBy=createdTime'); // oldest file wins
  });

  it('maps a 404 to "not found", which is not "offline"', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'File not found: f' } }, 404));
    await expect(api().listChildren('f', 'tok')).rejects.toBeInstanceOf(DriveNotFoundError);
  });

  it('creates a folder under a parent', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'new', name: 'SHTF Planner' }));
    const folder = await api().createFolder('root', 'SHTF Planner', 'tok');
    expect(folder.id).toBe('new');
    expect(init()?.method).toBe('POST');
    expect(JSON.parse(String(init()?.body))).toMatchObject({
      mimeType: DRIVE_FOLDER_MIME,
      parents: ['root'],
    });
  });

  it('reads bytes and text', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    expect(Array.from(await api().readBytes('x', 'tok'))).toEqual([1, 2, 3]);
    expect(url()).toContain('/files/x?alt=media');
    fetchMock.mockResolvedValueOnce(new Response('{"a":1}'));
    expect(await api().readText('x', 'tok')).toBe('{"a":1}');
  });

  it('creates a file with a multipart upload carrying the exact bytes', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'n', name: 'household.yjs', modifiedTime: 't' }));
    const content = new Uint8Array([0, 255, 13, 10, 7]);
    await api().writeFile(
      { parentId: 'p', name: 'household.yjs', mimeType: 'application/octet-stream', content },
      'tok',
    );
    expect(url()).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(init()?.method).toBe('POST');
    const headers = init()?.headers as Record<string, string>;
    expect(headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    const body = init()?.body as Blob;
    const text = new TextDecoder('latin1').decode(await body.arrayBuffer());
    expect(text).toContain('"name":"household.yjs"');
    expect(text).toContain('"parents":["p"]');
    expect(text).toContain('\u0000ÿ\r\n\u0007');
  });

  it('updates a file in place by id', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'n', modifiedTime: 't2' }));
    const file = await api().writeFile(
      {
        parentId: 'p',
        name: 'household.json',
        mimeType: 'application/json',
        content: '{}',
        fileId: 'n',
      },
      'tok',
    );
    expect(file).toMatchObject({ id: 'n', name: 'household.json', modifiedTime: 't2' });
    expect(url()).toContain('/upload/drive/v3/files/n?uploadType=media');
    expect(init()?.method).toBe('PATCH');
  });

  it('reads the account email from about', async () => {
    fetchMock.mockResolvedValueOnce(json({ user: { emailAddress: 'a@example.test' } }));
    expect(await api().getUserEmail('tok')).toBe('a@example.test');
    expect(url()).toContain('/drive/v3/about');
  });

  it('maps 401, 403, 409, other statuses and a thrown fetch to typed errors', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'bad' } }, 401));
    await expect(api().listChildren('p', 't')).rejects.toBeInstanceOf(DriveAuthError);
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'no' } }, 403));
    await expect(api().listChildren('p', 't')).rejects.toBeInstanceOf(DriveScopeError);
    fetchMock.mockResolvedValueOnce(json({}, 409));
    await expect(api().listChildren('p', 't')).rejects.toBeInstanceOf(DriveNameConflictError);
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(api().listChildren('p', 't')).rejects.toBeInstanceOf(DriveNetworkError);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api().listChildren('p', 't')).rejects.toBeInstanceOf(DriveNetworkError);
  });
});
