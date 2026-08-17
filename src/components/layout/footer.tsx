import Link from 'next/link';
import { Facebook, Instagram, Youtube, Mail } from 'lucide-react';
import { Logo } from '@/components/logo';

const FOOTER_LINKS = {
  company: [
    { name: 'About Us', href: '#' },
    { name: 'Our Values', href: '#' },
    { name: 'Privacy Notice', href: '#' },
    { name: 'Terms & Conditions', href: '#' },
    { name: 'Cookie Policy', href: '#' },
    { name: 'Corporate Information', href: '#' },
    { name: 'Media Outreach', href: '#' },
    { name: 'Distributor Queries', href: '#' },
    { name: 'Grievance Redressal', href: '#' },
  ],
  quick: [
    { name: 'Blog', href: '#' },
    { name: 'FAQs', href: '#' },
    { name: 'Shipping Policy', href: '#' },
    { name: 'Return Policy', href: '#' },
    { name: 'Track Order', href: '/track-order' },
    { name: 'Download App', href: '#' },
    { name: 'Payment Policy', href: '#' },
  ],
  contact: [
    { name: 'AI WhatsApp: +91 99999 99999', href: 'https://wa.me/919999999999' },
    { name: 'support@brand.com', href: 'mailto:support@brand.com' },
    { name: 'Gift Inquiries', href: '#' },
    { name: 'Fill Contact Form', href: '#' },
  ]
};

export function Footer() {
  return (
    <footer className="bg-foreground text-background pt-24 pb-12">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 border-b border-background/10 pb-20">
        <div className="space-y-8">
          <Logo className="text-background" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-background/60 leading-relaxed">
            Science-forward personal care. Formulated in-house. Delivered directly to your door.
          </p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-primary transition-colors"><Facebook className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-primary transition-colors"><Instagram className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-primary transition-colors"><Youtube className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-primary transition-colors"><Mail className="h-5 w-5" /></Link>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-8">Company</h3>
          <ul className="space-y-4">
            {FOOTER_LINKS.company.map((link) => (
              <li key={link.name}>
                <Link href={link.href} className="text-[10px] text-background/60 hover:text-background transition-colors uppercase tracking-widest font-bold">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-8">Quick Links</h3>
          <ul className="space-y-4">
            {FOOTER_LINKS.quick.map((link) => (
              <li key={link.name}>
                <Link href={link.href} className="text-[10px] text-background/60 hover:text-background transition-colors uppercase tracking-widest font-bold">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-8">Contact Us</h3>
          <ul className="space-y-4">
            {FOOTER_LINKS.contact.map((link) => (
              <li key={link.name}>
                <Link href={link.href} className="text-[10px] text-background/60 hover:text-background transition-colors uppercase tracking-widest font-bold">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-12 space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-widest">Newsletter</h4>
            <div className="flex border-b border-background/20 pb-2">
              <input 
                type="email" 
                placeholder="Enter email" 
                className="bg-transparent text-[10px] px-0 py-2 w-full focus:outline-none placeholder:text-background/40 uppercase tracking-widest font-bold"
              />
              <button className="text-[10px] font-black uppercase tracking-[0.2em] ml-4 hover:text-primary transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 mt-12 flex flex-col md:flex-row justify-between items-center text-[8px] uppercase tracking-[0.3em] text-background/40 font-black gap-6">
        <div>© {new Date().getFullYear()} Minimalist Skincare. All rights reserved.</div>
        <div className="flex gap-8">
          <Link href="#" className="hover:text-background">Privacy Policy</Link>
          <Link href="#" className="hover:text-background">Terms of Use</Link>
          <Link href="#" className="hover:text-background">Cookie Settings</Link>
        </div>
      </div>
    </footer>
  );
}
