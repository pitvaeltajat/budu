export type AttachmentFile = { id: number; name: string; type: string };

/**
 * Kitsas liitteet as chips. Shared by the dashboard's latest-expenses list and
 * the category modal so a voucher's attachments look and link the same in both;
 * the href goes through Budu's proxy, which is where the Kitsas token lives.
 */
export function AttachmentLinks({ files }: { files: AttachmentFile[] | undefined }) {
  if (!files?.length) return null;
  return (
    <span className="attachments">
      {files.map((file) => (
        <a
          key={file.id}
          href={`/api/kitsas/attachment/${file.id}`}
          target="_blank"
          rel="noreferrer"
          className="attachment"
        >
          {file.type === 'application/pdf' ? 'PDF' : file.type.startsWith('image/') ? 'Kuva' : 'Liite'}
          <span className="attachment-name">{file.name}</span>
        </a>
      ))}
    </span>
  );
}
