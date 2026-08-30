/**
 * Shared shell for policy pages.
 *
 * These exist because 19 footer links pointed at "#", and because a payment
 * provider will not activate a live account without published terms, privacy,
 * refund, shipping and contact pages.
 *
 * The copy below is a working draft, not legal advice. Anything a business
 * must state accurately — registered entity name, address, GST number,
 * grievance officer — is marked with [TO CONFIRM] rather than invented,
 * because guessing those would be worse than leaving them visibly blank.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <article
        className="
          [&_h1]:font-headline [&_h1]:text-3xl [&_h1]:font-normal [&_h1]:tracking-tight [&_h1]:md:text-4xl
          [&_h2]:mt-10 [&_h2]:font-headline [&_h2]:text-xl [&_h2]:font-normal [&_h2]:tracking-tight
          [&_p]:mt-4 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground
          [&_li]:mt-2 [&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-muted-foreground
          [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5
          [&_a]:text-primary [&_a]:underline
        "
      >
        {children}
      </article>
    </div>
  );
}
