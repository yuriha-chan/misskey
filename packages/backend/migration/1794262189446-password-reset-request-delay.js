/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PasswordResetRequestDelay1794262189446 {
	name = 'PasswordResetRequestDelay1794262189446';

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "password_reset_request" ADD COLUMN IF NOT EXISTS "delay" integer NOT NULL DEFAULT 0`);
	}

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "password_reset_request" DROP COLUMN IF EXISTS "delay"`);
	}
}
