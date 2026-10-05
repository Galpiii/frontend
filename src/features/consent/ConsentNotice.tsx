import { Fragment, type ReactNode } from 'react'

// Only formatting is interpreted. HTML, scripts, images and links stay text.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={index} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}

/** Render the server's versioned notice without substituting a local policy. */
export function ConsentNotice({ text }: { text: string }) {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  const blocks: ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      blocks.push(
        <Tag
          key={i}
          className={
            level === 1
              ? 'text-lg font-bold leading-snug text-ink'
              : level === 2
                ? 'border-t border-line pt-5 text-base font-bold text-ink'
                : 'text-sm font-semibold text-ink'
          }
        >
          {inline(heading[2])}
        </Tag>,
      )
    } else if (/^[-*] /.test(line)) {
      const start = i
      const items: ReactNode[] = []
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().slice(2))}</li>)
        i++
      }
      i--
      blocks.push(
        <ul
          key={start}
          className="list-disc space-y-1.5 pl-5 marker:text-faint"
        >
          {items}
        </ul>,
      )
    } else if (/^---+$/.test(line)) {
      blocks.push(<hr key={i} className="border-line" />)
    } else if (line.startsWith('> ')) {
      blocks.push(
        <blockquote key={i} className="border-l-2 border-line pl-3 font-medium">
          {inline(line.slice(2))}
        </blockquote>,
      )
    } else {
      blocks.push(
        <p key={i} className="whitespace-pre-wrap">
          {inline(line)}
        </p>,
      )
    }
  }
  return (
    <article className="space-y-3 break-words text-[13px] leading-7 text-muted">
      {blocks}
    </article>
  )
}
