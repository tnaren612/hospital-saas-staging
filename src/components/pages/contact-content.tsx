"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  MessageCircle,
  Loader2,
  Navigation,
  Siren,
} from "lucide-react";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { contactSchema, type ContactFormValues } from "@/lib/validation";
import { getHospital, WHATSAPP_MESSAGE } from "@/lib/data";
import {
  formatPhone,
  getTelUrl,
  getWhatsAppUrl,
} from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { CmsPageBanner } from "@/components/ui/cms-page-banner";

export function ContactContent() {
  const hospital = getHospital();
  const { t } = useLocale();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactFormValues) => {
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : "Unable to send message";
        throw new Error(msg);
      }
      toast.success(json.message || "Message sent successfully");
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
  };

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${hospital.geo.lat},${hospital.geo.lng}`;

  return (
    <div className="page-enter">
      <CmsPageBanner
        section="contact"
        title="Contact Us"
        subtitle="Reach our team for appointments, emergencies, or general inquiries."
      />
      <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: "Contact" }]} />
      </div>

      <Section>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <div className="space-y-3 sm:space-y-4">
            <Card>
              <CardContent className="flex gap-4 p-4 sm:p-5">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden />
                <div className="min-w-0">
                  <div className="font-semibold">Address</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hospital.address.line1}, {hospital.address.line2},{" "}
                    {hospital.address.city}, {hospital.address.state}{" "}
                    {hospital.address.pincode}, {hospital.address.country}
                  </p>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300"
                  >
                    <Navigation className="h-3.5 w-3.5" aria-hidden />
                    Get directions
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emergency/30 bg-emergency-soft/40 dark:bg-emergency/10">
              <CardContent className="flex gap-4 p-4 sm:p-5">
                <Siren className="mt-0.5 h-5 w-5 shrink-0 text-emergency" aria-hidden />
                <div>
                  <div className="font-semibold text-emergency">
                    24×7 Emergency
                  </div>
                  <a
                    href={getTelUrl(hospital.emergencyPhone)}
                    className="mt-1 block text-sm font-semibold text-emergency underline-offset-2 hover:underline"
                  >
                    {formatPhone(hospital.emergencyPhone)}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    For severe breathlessness or critical illness, call
                    immediately.
                  </p>
                </div>
              </CardContent>
            </Card>

            {hospital.phones.map((p) => (
              <Card key={p}>
                <CardContent className="flex gap-4 p-4 sm:p-5">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden />
                  <div>
                    <div className="font-semibold">Phone</div>
                    <a
                      href={getTelUrl(p)}
                      className="mt-1 block min-h-10 py-1 text-sm text-primary-700 dark:text-primary-300"
                    >
                      {formatPhone(p)}
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardContent className="flex gap-4 p-4 sm:p-5">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden />
                <div>
                  <div className="font-semibold">Email</div>
                  <a
                    href={`mailto:${hospital.email}`}
                    className="mt-1 block min-h-10 break-all py-1 text-sm text-primary-700 dark:text-primary-300"
                  >
                    {hospital.email}
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex gap-4 p-4 sm:p-5">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" aria-hidden />
                <div>
                  <div className="font-semibold">Timings</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hospital.timings.opd}
                    <br />
                    {hospital.timings.emergency}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={getWhatsAppUrl(hospital.whatsapp, WHATSAPP_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="whatsapp" className="w-full min-h-12">
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp Us
                </Button>
              </a>
              <a href={getTelUrl(hospital.emergencyPhone)}>
                <Button variant="emergency" className="w-full min-h-12">
                  <Phone className="h-4 w-4" aria-hidden />
                  Emergency Call
                </Button>
              </a>
            </div>
          </div>

          <Card className="shadow-lift">
            <CardContent className="p-5 sm:p-6 md:p-8">
              <h2 className="text-xl font-bold">Send a Message</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We typically respond within one business day. For emergencies,
                please call.
              </p>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="mt-6 space-y-4"
                noValidate
              >
                <div>
                  <Label htmlFor="contact-name" className="mb-2 block">
                    Name
                  </Label>
                  <Input
                    id="contact-name"
                    autoComplete="name"
                    {...register("name")}
                    placeholder="Your name"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-emergency" role="alert">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="contact-phone" className="mb-2 block">
                      Phone
                    </Label>
                    <Input
                      id="contact-phone"
                      autoComplete="tel"
                      inputMode="numeric"
                      {...register("phone")}
                      placeholder="10-digit mobile"
                      maxLength={10}
                    />
                    {errors.phone && (
                      <p className="mt-1 text-xs text-emergency" role="alert">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="contact-email" className="mb-2 block">
                      Email
                    </Label>
                    <Input
                      id="contact-email"
                      autoComplete="email"
                      type="email"
                      {...register("email")}
                      placeholder="you@email.com"
                    />
                    {errors.email && (
                      <p className="mt-1 text-xs text-emergency" role="alert">
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="contact-subject" className="mb-2 block">
                    Subject
                  </Label>
                  <Input
                    id="contact-subject"
                    {...register("subject")}
                    placeholder="How can we help?"
                  />
                  {errors.subject && (
                    <p className="mt-1 text-xs text-emergency" role="alert">
                      {errors.subject.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="contact-message" className="mb-2 block">
                    Message
                  </Label>
                  <Textarea
                    id="contact-message"
                    rows={5}
                    {...register("message")}
                    placeholder="Your message"
                  />
                  {errors.message && (
                    <p className="mt-1 text-xs text-emergency" role="alert">
                      {errors.message.message}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-12 sm:w-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {t.common.loading}
                    </>
                  ) : (
                    t.common.sendMessage
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border shadow-soft sm:mt-12 sm:rounded-3xl">
          <iframe
            title={`${hospital.name} location map`}
            src={`https://maps.google.com/maps?q=${hospital.geo.lat},${hospital.geo.lng}&z=15&output=embed`}
            className="h-[280px] w-full border-0 sm:h-[360px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </Section>
    </div>
  );
}
