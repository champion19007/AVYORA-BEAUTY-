import Link from 'next/link';
import { Facebook, Instagram, Youtube, Mail } from 'lucide-react';

const FOOTER_LINKS = {
  company: [
    { name: 'About Us', href: '#' },
    { name: 'Our Values', href: '#' },
    { name: 'Privacy Notice', href: '#' },
    { name: 'Terms & Conditions', href: '#' },
    { name: 'Corporate Information', href: '#' },
  ],
  quick: [
    { name: 'Blog', href: '#' },
    { name: 'FAQs', href: '#' },
    { name: 'Shipping Policy', href: '#' },
    { name: 'Return Policy', href: '#' },
    { name: 'Track Order', href: '/track-order' },
  ],
  contact: [
    { name: 'AI WhatsApp: +91 99999 99999', href: 'https://wa.me/919999999999' },
    { name: 'support@brand.com', href: 'mailto:support@brand.com' },
    { name: 'Fill Contact Form', href: '#' },
  ]
};

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground pt-20 pb-10 mt-20">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 border-b border-border/10 pb-12">
        <div>
          <h3 className="text-lg mb-6">Company</h3>
          <ul className="space-y-4">
            {FOOTER_LINKS.company.map((link) => (
              <li key={link.name}>
                <Link href={link.href} className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg mb-6">Quick Links</h3>
          <ul className="space-y-4">
            {FOOTER_LINKS.quick.map((link) => (
              <li key={link.name}>
                <Link href={link.href} className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg mb-6">Contact Us</h3>
          <ul className="space-y-4">
            {FOOTER_LINKS.contact.map((link) => (
              <li key={link.name}>
                <Link href={link.href} className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg mb-6">Follow Us</h3>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-accent"><Facebook className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-accent"><Instagram className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-accent"><Youtube className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-accent"><Mail className="h-5 w-5" /></Link>
          </div>
          <div className="mt-8">
            <h4 className="text-sm font-bold uppercase mb-4">Newsletter</h4>
            <div className="flex">
              <input 
                type="email" 
                placeholder="Enter email" 
                className="bg-primary-foreground/5 border-border/20 text-sm px-4 py-2 w-full focus:outline-none"
              />
              <button className="bg-primary-foreground text-primary px-4 py-2 text-xs font-bold uppercase tracking-widest">
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-10 flex flex-col md:flex-row justify-between items-center text-[10px] uppercase tracking-widest text-primary-foreground/40 gap-4">
        <div>© {new Date().getFullYear()} Minimalist Skincare. All rights reserved.</div>
        <div className="flex gap-6">
          <Link href="#">Privacy Policy</Link>
          <Link href="#">Terms of Use</Link>
          <Link href="#">Cookie Settings</Link>
        </div>
      </div>
    </footer>
  );
}
