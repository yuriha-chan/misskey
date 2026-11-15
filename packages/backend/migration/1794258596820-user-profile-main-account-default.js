/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserProfileMainAccountDefault1794258596820 {
	name = 'UserProfileMainAccountDefault1794258596820';

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "mainAccountId" DROP DEFAULT`);
	}

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "mainAccountId" SET DEFAULT NULL`);
	}
}
