-- A middle tier between "can do anything" and "can only look".
--
-- The rail already offers Switch User and Log Out, so the product assumes more
-- than one person uses this screen. Two roles could not express the obvious
-- split on a farm: the office manager who reviews and corrects logs all day,
-- and the owner who is also the only person who should be able to delete them.
alter type public.member_role add value if not exists 'manager' after 'admin';
