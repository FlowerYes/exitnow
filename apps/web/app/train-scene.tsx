'use client';

import {ArrowUpRight} from 'lucide-react';

const MODEL_URL = 'https://sketchfab.com/3d-models/r160-train-new-york-city-subway-bf216a59be4c4ce095026c2dcda93537';
const VIEWER_URL = 'https://sketchfab.com/models/bf216a59be4c4ce095026c2dcda93537/embed';
// Public preview supplied by Sketchfab's official oEmbed endpoint; never a copied model.
const POSTER_URL = 'https://media.sketchfab.com/models/bf216a59be4c4ce095026c2dcda93537/thumbnails/8320c8ce2842431ea4f17d826aa830e9/5f0ff0cd519145e7abac00121dd597e9.jpeg';

/** Official publisher preview. Progress remains accepted for existing callers. */
export default function TrainScene(_props: {progress?: number}) {
  return (
    <figure
      className="train-artwork"
      style={{margin: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#c7c7c7', color: 'var(--pitch-ink, #111716)'}}
    >
      <a
        href={VIEWER_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Explore SQUIR3D’s R160 subway train in 3D on Sketchfab (opens a new tab)"
        style={{display: 'block', flex: 1, minHeight: 0, position: 'relative', color: 'inherit'}}
      >
        <img
          src={POSTER_URL}
          alt="Detailed silver New York City R160 subway train on rails, viewed from the front and side."
          width={720}
          height={405}
          fetchPriority="high"
          style={{display: 'block', width: '100%', height: '100%', objectFit: 'cover'}}
        />
        <span style={{position: 'absolute', bottom: 20, left: 20, display: 'inline-flex', alignItems: 'center', gap: 14, minHeight: 44, padding: '10px 16px', background: 'var(--pitch-ink, #111716)', color: 'var(--pitch-paper, #eeeee9)', borderRadius: 5, fontSize: 14}}>
          Explore in 3D <ArrowUpRight size={18} aria-hidden="true"/>
        </span>
      </a>
      <figcaption style={{padding: '10px 16px', fontSize: 12, lineHeight: 1.5, background: 'var(--pitch-paper, #eeeee9)', textAlign: 'right'}}>
        <a href={MODEL_URL} target="_blank" rel="noopener noreferrer" style={{color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3}}>R160 subway train</a>
        {' by '}
        <a href="https://sketchfab.com/SQUIR3D" target="_blank" rel="noopener noreferrer" style={{color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3}}>SQUIR3D</a>
        {' · Sketchfab'}
      </figcaption>
    </figure>
  );
}
