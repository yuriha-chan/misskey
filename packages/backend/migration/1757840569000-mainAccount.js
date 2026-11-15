/*
 *  * SPDX-FileCopyrightText: syuilo and misskey-project
 *   * SPDX-License-Identifier: AGPL-3.0-only
 *    */

export class MainAccount1757840569000 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" ADD COLUMN "mainAccountId" character varying(32) DEFAULT NULL`);
		await queryRunner.query(`CREATE INDEX "IDX_user_profile_mainAccount" ON "user_profile"("mainAccountId")`);
	}
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_user_profile_mainAccount"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "mainAccountId"`);
	}
}

