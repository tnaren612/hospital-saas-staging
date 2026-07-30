export const CMS_PAGE_KEYS = [
  "home",
  "about",
  "services",
  "facilities",
  "insurance",
  "faq",
  "careers",
  "contact",
  "privacy",
  "terms",
  "header",
  "footer",
] as const;

export type CmsPageKey = (typeof CMS_PAGE_KEYS)[number];
export type CmsPageStatus = "draft" | "published" | "archived";

export type CmsBlock = {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  image_url?: string;
  data?: Record<string, unknown>;
};

export type CmsPageContent = {
  blocks: CmsBlock[];
};

export type CmsPage = {
  id: string;
  hospital_id: string;
  page_key: CmsPageKey;
  title: string;
  slug: string;
  status: CmsPageStatus;
  content: CmsPageContent;
  seo: {
    title?: string;
    description?: string;
    image_url?: string;
    keywords?: string;
  };
  published_at: string | null;
  updated_at: string;
};

export type CmsNavigationLocation = "header" | "footer" | "utility";
export type CmsNavigationItem = {
  id: string;
  label: string;
  href: string;
  order: number;
  visible: boolean;
  external?: boolean;
};

export type CmsAnnouncement = {
  id: string;
  title: string;
  message: string;
  link_url: string;
  starts_at: string | null;
  ends_at: string | null;
  status?: CmsPageStatus;
};
