import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Section } from '@/components/ui/section';
import { SectionHeading } from '@/components/ui/section-heading';

export const metadata: Metadata = {
  title: 'Contact Us | EHEMS Platform',
  description:
    'Get in touch with the EHEMS platform team for inquiries regarding membership tiers, payment verification, or platform support.',
};

export default function ContactPage() {
  return (
    <main id="main" className="py-12 sm:py-16">
      <Section labelledBy="contact-title">
        <SectionHeading
          titleId="contact-title"
          eyebrow={<Eyebrow>Get In Touch</Eyebrow>}
          title="Contact EHEMS Team"
          lede="Have questions about our training programmes or membership tiers? Reach out and we will respond promptly."
        />

        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          {/* Contact Details Column */}
          <div className="space-y-8">
            <div className="border-outline-variant bg-surface-container-lowest rounded-3xl border p-8 shadow-sm">
              <Eyebrow>Office & Support Hours</Eyebrow>
              <h2 className="headline-small mt-3 font-bold text-on-surface">Operating Hours</h2>
              <p className="body-large text-on-surface-variant mt-2">
                Monday – Friday: 8:00 AM – 6:00 PM (WAT / UTC+1)
              </p>
              <p className="body-medium text-on-surface-variant mt-1">Nigeria Timezone (WAT)</p>
            </div>

            <div className="border-outline-variant bg-surface-container-lowest rounded-3xl border p-8 shadow-sm space-y-4">
              <div>
                <h3 className="title-medium font-bold text-on-surface">Email Inquiries</h3>
                <p className="body-medium text-on-surface-variant mt-1">support@ehems.ng</p>
              </div>

              <div className="border-outline-variant border-t pt-4">
                <h3 className="title-medium font-bold text-on-surface">Payment Verification</h3>
                <p className="body-medium text-on-surface-variant mt-1">
                  Manual payment proof is processed within 24–48 hours by our admin team.
                </p>
              </div>
            </div>
          </div>

          {/* Contact Form Column */}
          <div className="border-outline-variant bg-surface-container-lowest rounded-3xl border p-8 shadow-sm">
            <h2 className="headline-small font-bold text-on-surface">Send us a message</h2>
            <p className="body-medium text-on-surface-variant mt-2">
              Fill in your details below and an EHEMS representative will contact you.
            </p>

            <form className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="fullName"
                  className="label-medium text-on-surface block font-medium"
                >
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  placeholder="Your full name"
                  className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1.5 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                />
              </div>

              <div>
                <label htmlFor="email" className="label-medium text-on-surface block font-medium">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1.5 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                />
              </div>

              <div>
                <label htmlFor="message" className="label-medium text-on-surface block font-medium">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  required
                  placeholder="How can we help you?"
                  className="border-outline bg-surface-container-lowest text-on-surface focus:border-primary focus:ring-primary/20 mt-1.5 w-full rounded-xl border px-3.5 py-2.5 outline-none transition-all focus:ring-2"
                />
              </div>

              <button
                type="submit"
                className="bg-primary text-on-primary text-label-large hover:bg-primary/90 mt-2 w-full rounded-xl px-4 py-3 font-semibold shadow-sm transition-colors"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </Section>
    </main>
  );
}
