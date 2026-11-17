import type { Child } from 'hono/jsx';
import type { Ctx } from '../env.ts';
import { Shell } from './layout.tsx';

/** Print-ready document page (A4/Letter), with a toolbar hidden when printing. */
export function DocPage(c: Ctx, props: { title: string; back: string; tools?: Child; children: Child }) {
  const flash = c.get('flash');
  return c.html(
    <Shell title={props.title}>
      <div class="doc-wrap">
        <div class="doc-tools row">
          <a class="btn" href={props.back}>← Back</a>
          <button class="btn primary" data-print>Print / Save as PDF</button>
          {props.tools}
        </div>
        {flash ? <div class={`flash ${flash.kind}`} style="max-width:820px;margin:0 auto 12px">{flash.msg}</div> : null}
        <article class="doc">{props.children}</article>
      </div>
    </Shell>,
  );
}
