import SessionClient from './SessionClient';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SessionClient code={code.toUpperCase()} />;
}
