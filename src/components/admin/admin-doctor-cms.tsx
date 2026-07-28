"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { doctorUpdateSchema, type DoctorUpdateFormValues } from "@/lib/validation";
import doctorJson from "@/data/doctor.json";
import { getStoredDoctor, saveDoctor } from "@/lib/storage";
import { sanitizeText, stripHtml } from "@/lib/utils";
import type { DoctorProfile } from "@/types";

export function AdminDoctorCms() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DoctorUpdateFormValues>({
    resolver: zodResolver(doctorUpdateSchema),
  });

  useEffect(() => {
    const doctor = (getStoredDoctor() || doctorJson) as DoctorProfile;
    reset({
      name: doctor.name,
      title: doctor.title,
      bio: doctor.bio,
      consultationFee: doctor.consultationFee,
      videoConsultationFee: doctor.videoConsultationFee,
      qualifications: doctor.qualifications.join(", "),
      specializations: doctor.specializations.join(", "),
      experience: doctor.experience.join("\n"),
      image: doctor.image,
    });
  }, [reset]);

  const onSubmit = (data: DoctorUpdateFormValues) => {
    const current = (getStoredDoctor() || doctorJson) as DoctorProfile;
    const updated: DoctorProfile = {
      ...current,
      name: sanitizeText(stripHtml(data.name)),
      title: sanitizeText(stripHtml(data.title)),
      bio: sanitizeText(stripHtml(data.bio)),
      consultationFee: data.consultationFee,
      videoConsultationFee: data.videoConsultationFee,
      qualifications: data.qualifications.split(",").map((s) => s.trim()).filter(Boolean),
      specializations: data.specializations.split(",").map((s) => s.trim()).filter(Boolean),
      experience: data.experience.split("\n").map((s) => s.trim()).filter(Boolean),
      image: data.image,
    };
    saveDoctor(updated);
    toast.success("Doctor profile updated (localStorage)");
  };

  return (
          <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Doctor CMS</h1>
          <p className="text-sm text-muted-foreground">
            Update doctor name, qualifications, experience, photo path, and services.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="mb-2 block">Doctor Name</Label>
                <Input {...register("name")} />
                {errors.name && (
                  <p className="mt-1 text-xs text-emergency">{errors.name.message}</p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Title</Label>
                <Input {...register("title")} />
              </div>
              <div>
                <Label className="mb-2 block">Photo path</Label>
                <Input {...register("image")} placeholder="/assets/images/doctor/profile.svg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">OPD Fee</Label>
                  <Input type="number" {...register("consultationFee")} />
                </div>
                <div>
                  <Label className="mb-2 block">Video Fee</Label>
                  <Input type="number" {...register("videoConsultationFee")} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block">Qualifications (comma separated)</Label>
                <Input {...register("qualifications")} />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block">Specializations / Services (comma separated)</Label>
                <Input {...register("specializations")} />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block">Experience (one per line)</Label>
                <Textarea {...register("experience")} className="min-h-[120px]" />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-2 block">Bio</Label>
                <Textarea {...register("bio")} className="min-h-[140px]" />
              </div>
              <div>
                <Button type="submit" disabled={isSubmitting}>
                  Save Doctor Profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
  );
}
