import type { Metadata } from 'next';
import { PRODUCTS } from '@/data/mock-data';
import { REDESIGN } from '@/lib/redesign';
import { Accordion } from '@/components/nv/accordion';
import { TextAreaField, TextField } from '@/components/nv/field';
import { NvImage } from '@/components/nv/nv-image';
import { ArrowLink, Button, Card, Container, Eyebrow, Grid, Heading, Muted, Section, Skeleton, Spinner, StatusMessage, Text, Wordmark } from '@/components/nv/primitives';
import { DialogDemo } from './dialog-demo';
import { DEMO_BROKEN_IMAGE, DEMO_FAQ, DEMO_LONG_TITLE } from './fixtures';

/**
 * Review page for the redesign primitives: every component and state on one
 * page, for checking at 1280, 1440 and 1920, by keyboard and at 200 percent
 * zoom. Not indexed and not linked; demo copy comes from ./fixtures.
 */
export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } };

const SWATCHES = [
  ['nv-page', '#FAFAFA', 'bg-nv-page'],
  ['nv-ink', '#1A1A1A', 'bg-nv-ink'],
  ['nv-muted', '#696666', 'bg-nv-muted'],
  ['nv-faint', '#ADADAD', 'bg-nv-faint'],
  ['nv-card', '#FFFFFF', 'bg-nv-card'],
  ['nv-line', '#E8E8E8', 'bg-nv-line'],
] as const;

const TYPE = [
  ['text-nv-hero', 'Hero 100/100 −6'],
  ['text-nv-display', 'Display 80/88 −3.2'],
  ['text-nv-statement', 'Statement 40/52 −1.6'],
  ['text-nv-title', 'Title 32/35.2 −1.28'],
  ['text-nv-lead', 'Lead 28/30.8 −1.12'],
  ['text-nv-intro', 'Intro 20/26 −0.6'],
  ['text-nv-body', 'Body 18/23.4 −0.3'],
  ['text-nv-label', 'Label 16/20.8 −0.64'],
  ['text-nv-small', 'Small 14/19.6 −0.56'],
] as const;

export default function DesignSystemPage() {
  const sample = PRODUCTS.slice(0, 2);
  return (
    <div className="bg-nv-page font-nv text-nv-ink">
      <Section space="sm">
        <Container className="space-y-6">
          <Eyebrow className="text-nv-muted">Redesign review</Eyebrow>
          <Heading as="h1" size="display">
            Design system <Muted>primitives</Muted>
          </Heading>
          <Text size="intro">
            Redesign flag: <strong className="text-nv-ink">{REDESIGN ? 'on' : 'off'}</strong>. Values come from the Nuvē reference measured on 8 October 2026.
          </Text>
        </Container>
      </Section>

      <Section space="sm" aria-labelledby="ds-type">
        <Container className="space-y-6">
          <Heading id="ds-type" size="title">Typography</Heading>
          {TYPE.map(([cls, label]) => (
            <p key={cls} className={`${cls} font-medium`}>
              {label}
            </p>
          ))}
          <div className="flex items-baseline gap-10">
            <Wordmark />
            <Wordmark size="lg" />
          </div>
        </Container>
      </Section>

      <Section space="sm" aria-labelledby="ds-colour">
        <Container>
          <Heading id="ds-colour" size="title">Colour</Heading>
          <ul className="mt-6 grid grid-cols-6 gap-nv-gap">
            {SWATCHES.map(([name, hex, cls]) => (
              <li key={name} className="rounded-nv-card bg-nv-card p-4">
                <div className={`h-20 rounded-nv-inner border border-nv-line ${cls}`} />
                <p className="mt-3 text-nv-label">{name}</p>
                <p className="text-nv-small text-nv-muted">{hex}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section space="sm" aria-labelledby="ds-actions">
        <Container className="space-y-8">
          <Heading id="ds-actions" size="title">Buttons and links</Heading>
          <div className="flex flex-wrap items-center gap-4">
            <Button>Find my routine</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button size="lg">Large action</Button>
            <ArrowLink href="/assistant">Ask a question</ArrowLink>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-nv-card bg-nv-ink p-8">
            <Button variant="light">Start your routine</Button>
            <Button variant="light" size="lg">
              Light large
            </Button>
          </div>
        </Container>
      </Section>

      <Section space="sm" aria-labelledby="ds-cards">
        <Container className="space-y-6">
          <Heading id="ds-cards" size="title">Cards and images</Heading>
          <Grid cols={2}>
            {sample.map((p) => (
              <article key={p.id} className="space-y-4">
                <NvImage src={p.images[0]} alt={p.name} ratio={616 / 585} sizes="(min-width: 1440px) 616px, 50vw" />
                <h3 className="text-nv-title">{p.name}</h3>
              </article>
            ))}
          </Grid>
          <Grid cols={3}>
            <Card>
              <p className="text-nv-label text-nv-muted">01</p>
              <h3 className="mt-10 text-nv-title">{DEMO_LONG_TITLE}</h3>
            </Card>
            <article className="space-y-3">
              <NvImage src={DEMO_BROKEN_IMAGE} alt="DEMO: an image that fails to load keeps its slot" ratio={408 / 194} sizes="408px" />
              <Text size="small">Failure state: same size, alternative text shown.</Text>
            </article>
            <Card className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Spinner label="Loading prices" />
            </Card>
          </Grid>
        </Container>
      </Section>

      <Section space="sm" aria-labelledby="ds-forms">
        <Container className="grid grid-cols-2 gap-16">
          <div className="space-y-6">
            <Heading id="ds-forms" size="title">Fields</Heading>
            <TextField id="ds-name" label="Your name" autoComplete="name" />
            <TextField id="ds-email" label="Email" type="email" hint="We reply within the hours shown on the contact page." error="Enter an email address like name@example.com." defaultValue="not-an-email" />
            <TextAreaField id="ds-message" label="Message" />
          </div>
          <div className="space-y-4">
            <Heading size="title" as="h3">Status messages</Heading>
            <StatusMessage tone="info" title="Prices are being checked">This takes a moment.</StatusMessage>
            <StatusMessage tone="success">Saved to your routines.</StatusMessage>
            <StatusMessage tone="warning" title="Prices may have changed">Refresh to see current prices.</StatusMessage>
            <StatusMessage tone="error" title="We could not save your routine">Check your connection and try again.</StatusMessage>
            <DialogDemo />
          </div>
        </Container>
      </Section>

      <Section space="sm" aria-labelledby="ds-faq" tone="page">
        <Container className="grid grid-cols-[1fr_800px] gap-16">
          <div>
            <Heading id="ds-faq" size="display">FAQ</Heading>
            <Text className="mt-6 max-w-[260px]">DEMO supporting copy beside the accordion.</Text>
          </div>
          <Accordion items={DEMO_FAQ} />
        </Container>
      </Section>
    </div>
  );
}
