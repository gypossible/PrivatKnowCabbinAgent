import { NotebookWorkspace } from "@/components/NotebookWorkspace";

type PageProps = { params: Promise<{ notebookId: string }> };

export default async function NotebookPage({ params }: PageProps) {
  const { notebookId } = await params;
  return <NotebookWorkspace notebookId={notebookId} />;
}
