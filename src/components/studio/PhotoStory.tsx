'use client'

import Image from 'next/image'
import type { StoryFrame } from './content'

function FramePhoto({ frame, sizes }: { frame: StoryFrame; sizes: string }) {
  if (frame.second) {
    return (
      <figure className="is-pair">
        <span>
          <Image src={frame.image} alt={frame.alt} fill sizes={sizes} />
        </span>
        <span>
          <Image src={frame.second.image} alt={frame.second.alt} fill sizes={sizes} />
        </span>
      </figure>
    )
  }
  return (
    <figure>
      <Image src={frame.image} alt={frame.alt} fill sizes={sizes} />
    </figure>
  )
}

export function StepList({ frames }: { frames: StoryFrame[] }) {
  return (
    <ol className="st-step-list">
      {frames.map((frame) => (
        <li key={frame.title}>
          <FramePhoto frame={frame} sizes="120px" />
          <div>
            {frame.n ? <span>{frame.n}</span> : null}
            <h3>{frame.title}</h3>
            <p>{frame.text}</p>
            {frame.caption ? <p className="st-step-note">{frame.caption}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function IncludeGrid({ frames }: { frames: StoryFrame[] }) {
  return (
    <div className="st-include">
      {frames.map((frame) => (
        <article key={frame.title}>
          <FramePhoto frame={frame} sizes="(min-width: 800px) 20vw, 46vw" />
          <h3>{frame.title}</h3>
          <p>{frame.text}</p>
        </article>
      ))}
    </div>
  )
}
