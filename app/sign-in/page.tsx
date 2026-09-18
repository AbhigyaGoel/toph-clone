import Image from 'next/image';
import { redirect } from 'next/navigation';

import { ResetDemoButton } from '@/components/nav/ResetDemoButton';
import { SignInList } from '@/components/nav/SignInList';
import { findMembers } from '@/lib/repositories/members';
import { currentViewer, signInAvailable } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * Pick who you are.
 *
 * This is the whole of authentication in this build, and the README says so
 * plainly: there is no password, because a password form in front of Server
 * Actions that never check a role would be the wrong half of the problem to
 * solve first. What the pick buys is a signed session, and everything after it
 * — which controls appear, which writes the server will accept — is real.
 *
 * A deployment with no signing key cannot hold a session at all, so it skips
 * straight through to the dashboard in its unauthenticated, read-only state
 * rather than showing a sign-in screen that could not do anything.
 */
export default async function SignInPage() {
  if (!signInAvailable()) {
    redirect('/');
  }

  const viewer = await currentViewer();
  const members = await findMembers(viewer.organization.id);

  /*
   * One account, not three.
   *
   * The roster used to offer an admin, a manager and a worker to show the
   * permission model. The model is still there and still enforced on the
   * server — it just is not worth three near-identical doors on the way in,
   * and two of them led to a dashboard that looks the same with fewer buttons.
   */
  const signIn = members.filter((member) => member.role === 'admin');

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white p-[20px]">
      <div className="flex w-full max-w-[420px] flex-col gap-[24px]">
        <div className="flex flex-col items-center gap-[14px] text-center">
          <Image
            src={viewer.organization.avatarSrc}
            alt=""
            width={56}
            height={56}
            className="h-[56px] w-[56px] rounded-full object-cover"
          />
          <div className="flex flex-col gap-[4px]">
            <h1 className="text-[20px] font-semibold leading-[1.3] text-black">
              {viewer.organization.name}
            </h1>
            <p className="text-[16px] font-normal leading-[1.3] text-[#4D4D4D]">
              Sign in to continue
            </p>
          </div>
        </div>

        <SignInList members={signIn.length > 0 ? signIn : members.slice(0, 1)} />

        <p className="text-center text-[12px] font-normal leading-[1.5] text-black opacity-40">
          There is no password. Signing in writes the choice into an httpOnly cookie,
          and whether that role may write is re-checked on the server for every change.
        </p>

        <div className="border-t border-black/[0.06] pt-[20px]">
          <ResetDemoButton />
        </div>
      </div>
    </div>
  );
}
