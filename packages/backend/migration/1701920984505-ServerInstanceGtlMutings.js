/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ServerInstanceGtlMutings1701920984505 {
	name = 'ServerInstanceGtlMutings1701920984505'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "gtlMutedHosts" character varying(1024) array NOT NULL DEFAULT '{}'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "gtlMutedHosts"`);
	}
}
